/**
 * Reports Routes
 * 
 * API endpoints for generating and retrieving group reports.
 */

import { Router, Response } from 'express';
import { db, groupReports, groupMembers, groups } from '../db/index.js';
import { eq, and, desc } from 'drizzle-orm';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { createError } from '../middleware/error.js';
import { aiClient } from '../services/aiClient.js';
import { reportLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * Generate a new group report
 */
router.post('/group/:groupId/generate', reportLimiter, async (req: AuthRequest, res: Response, next) => {
  try {
    const { groupId } = req.params;
    const { reportType, dateRange, sections, customTitle, paperIds } = req.body;
    const userId = req.user!.id;

    // Pre-check AI service availability
    const isAvailable = await aiClient.isAvailable();
    if (!isAvailable) {
      throw createError('AI service is not available. Please ensure GROQ_API_KEY is configured.', 503);
    }

    // Verify membership
    const [membership] = await db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
      .limit(1);

    if (!membership) {
      throw createError('Group not found or access denied', 404);
    }

    // Get group details
    const [group] = await db
      .select()
      .from(groups)
      .where(eq(groups.id, groupId))
      .limit(1);

    if (!group) {
      throw createError('Group not found', 404);
    }

    // Create report record (pending)
    const [reportRecord] = await db
      .insert(groupReports)
      .values({
        groupId,
        createdBy: userId,
        title: customTitle || `${group.name} Research Report`,
        reportType: reportType || 'weekly',
        status: 'generating',
        metadata: {
          dateRange,
          sections,
          paperIds,
        },
      })
      .returning();

    // Call AI service to generate report
    try {
      const reportResponse = await aiClient.generateReport({
        group_id: groupId,
        user_id: userId,
        report_type: reportType || 'weekly',
        date_range: dateRange,
        sections: sections || ['overview', 'papers', 'discussions', 'insights'],
        custom_title: customTitle,
        paper_ids: paperIds,
      });

      // Update record with result
      const [updatedReport] = await db
        .update(groupReports)
        .set({
          status: 'completed',
          filePath: reportResponse.report_path || reportResponse.url,
          metadata: {
            ...reportRecord.metadata,
            generatedAt: new Date().toISOString(),
            fileSize: reportResponse.file_size,
          },
        })
        .where(eq(groupReports.id, reportRecord.id))
        .returning();

      res.status(201).json({
        reportId: updatedReport.id,
        title: updatedReport.title,
        status: updatedReport.status,
        downloadUrl: `/api/reports/${updatedReport.id}/download`,
        reportPath: reportResponse.report_path || reportResponse.url,
        summary: reportResponse.summary,
        createdAt: updatedReport.createdAt,
      });
    } catch (aiError: any) {
      // Update record with error
      await db
        .update(groupReports)
        .set({
          status: 'failed',
          metadata: {
            ...reportRecord.metadata,
            error: aiError.message,
          },
        })
        .where(eq(groupReports.id, reportRecord.id));

      throw createError('Failed to generate report: ' + aiError.message, 500);
    }
  } catch (error) {
    next(error);
  }
});

/**
 * List reports for a group
 */
router.get('/group/:groupId', async (req: AuthRequest, res: Response, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;

    // Verify membership
    const [membership] = await db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
      .limit(1);

    if (!membership) {
      throw createError('Group not found or access denied', 404);
    }

    const reports = await db
      .select()
      .from(groupReports)
      .where(eq(groupReports.groupId, groupId))
      .orderBy(desc(groupReports.createdAt));

    const reportsWithDownload = reports.map((r) => ({
      ...r,
      downloadUrl: r.status === 'completed' ? `/api/reports/${r.id}/download` : null,
    }));

    res.json(reportsWithDownload);
  } catch (error) {
    next(error);
  }
});

/**
 * Get report details
 */
router.get('/:reportId', async (req: AuthRequest, res: Response, next) => {
  try {
    const { reportId } = req.params;
    const userId = req.user!.id;

    // Get report
    const [report] = await db
      .select()
      .from(groupReports)
      .where(eq(groupReports.id, reportId))
      .limit(1);

    if (!report) {
      throw createError('Report not found', 404);
    }

    // Verify membership
    const [membership] = await db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, report.groupId), eq(groupMembers.userId, userId)))
      .limit(1);

    if (!membership) {
      throw createError('Report not found or access denied', 404);
    }

    res.json({
      ...report,
      downloadUrl: report.status === 'completed' ? `/api/reports/${report.id}/download` : null,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Download report PDF
 */
router.get('/:reportId/download', async (req: AuthRequest, res: Response, next) => {
  try {
    const { reportId } = req.params;
    const userId = req.user!.id;

    // Get report
    const [report] = await db
      .select()
      .from(groupReports)
      .where(eq(groupReports.id, reportId))
      .limit(1);

    if (!report) {
      throw createError('Report not found', 404);
    }

    // Verify membership
    const [membership] = await db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, report.groupId), eq(groupMembers.userId, userId)))
      .limit(1);

    if (!membership) {
      throw createError('Report not found or access denied', 404);
    }

    if (report.status !== 'completed' || !report.filePath) {
      throw createError('Report not available for download', 400);
    }

    // Stream the file from AI service (proxy to avoid Docker-internal URL exposure)
    const fileName = `${report.title.replace(/[^a-z0-9]/gi, '_')}.pdf`;
    
    const downloadUrl = `${process.env.AI_SERVICE_URL}${report.filePath}`;
    
    try {
      const aiResponse = await fetch(downloadUrl);
      if (!aiResponse.ok) {
        throw createError('Failed to fetch report file from AI service', 502);
      }
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      
      // Pipe the response body to the client
      const reader = aiResponse.body;
      if (reader) {
        const { Readable } = await import('stream');
        const nodeStream = Readable.fromWeb(reader as any);
        nodeStream.pipe(res);
      } else {
        const buffer = Buffer.from(await aiResponse.arrayBuffer());
        res.send(buffer);
      }
    } catch (fetchErr) {
      if ((fetchErr as any)?.statusCode) throw fetchErr;
      throw createError('AI service unavailable for report download', 502);
    }
  } catch (error) {
    next(error);
  }
});

/**
 * Delete a report
 */
router.delete('/:reportId', async (req: AuthRequest, res: Response, next) => {
  try {
    const { reportId } = req.params;
    const userId = req.user!.id;

    // Get report
    const [report] = await db
      .select()
      .from(groupReports)
      .where(eq(groupReports.id, reportId))
      .limit(1);

    if (!report) {
      throw createError('Report not found', 404);
    }

    // Verify ownership (only creator can delete)
    if (report.createdBy !== userId) {
      throw createError('Only the report creator can delete it', 403);
    }

    await db.delete(groupReports).where(eq(groupReports.id, reportId));

    res.json({ message: 'Report deleted' });
  } catch (error) {
    next(error);
  }
});

export default router;
