/**
 * Group Papers Routes
 * 
 * API endpoints for managing papers within groups and group-isolated RAG.
 */

import { Router, Response } from 'express';
import { db, groupPapers, papers, groupMembers } from '../db/index.js';
import { eq, and, desc } from 'drizzle-orm';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { createError } from '../middleware/error.js';
import { aiClient } from '../services/aiClient.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * Get all papers in a group
 */
router.get('/:groupId/papers', async (req: AuthRequest, res: Response, next) => {
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

    // Get group papers with paper details
    const groupPapersData = await db
      .select({
        id: groupPapers.id,
        paperId: groupPapers.paperId,
        notes: groupPapers.notes,
        addedAt: groupPapers.createdAt,
        title: papers.title,
        authors: papers.authors,
        abstract: papers.abstract,
        tags: papers.tags,
        url: papers.url,
        publishedDate: papers.publishedDate,
      })
      .from(groupPapers)
      .innerJoin(papers, eq(papers.id, groupPapers.paperId))
      .where(eq(groupPapers.groupId, groupId))
      .orderBy(desc(groupPapers.createdAt));

    res.json(groupPapersData);
  } catch (error) {
    next(error);
  }
});

/**
 * Add paper to group (and generate embeddings)
 */
router.post('/:groupId/papers', async (req: AuthRequest, res: Response, next) => {
  try {
    const { groupId } = req.params;
    const { paperId, notes } = req.body;
    const userId = req.user!.id;

    if (!paperId) {
      throw createError('Paper ID is required', 400);
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

    // Get paper details
    const [paper] = await db
      .select()
      .from(papers)
      .where(eq(papers.id, paperId))
      .limit(1);

    if (!paper) {
      throw createError('Paper not found', 404);
    }

    // Check if already in group
    const [existing] = await db
      .select()
      .from(groupPapers)
      .where(and(eq(groupPapers.groupId, groupId), eq(groupPapers.paperId, paperId)))
      .limit(1);

    if (existing) {
      res.json({ ...existing, message: 'Paper already in group' });
      return;
    }

    // Add to group
    const [newGroupPaper] = await db
      .insert(groupPapers)
      .values({
        groupId,
        paperId,
        addedBy: userId,
        notes,
      })
      .returning();

    // Generate embeddings via AI service
    try {
      await aiClient.addPaperToGroup({
        paper_id: paperId,
        group_id: groupId,
        user_id: userId,
        title: paper.title,
        abstract: paper.abstract,
        metadata: {
          authors: paper.authors,
          tags: paper.tags,
          url: paper.url,
        },
      });
    } catch (aiError) {
      console.error('Failed to generate paper embeddings:', aiError);
      // Continue - paper is still added, just not embedded
    }

    res.status(201).json({
      ...newGroupPaper,
      paper,
      message: 'Paper added to group',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Remove paper from group
 */
router.delete('/:groupId/papers/:paperId', async (req: AuthRequest, res: Response, next) => {
  try {
    const { groupId, paperId } = req.params;
    const userId = req.user!.id;

    // Verify membership (only owner/admin can remove)
    const [membership] = await db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
      .limit(1);

    if (!membership) {
      throw createError('Group not found or access denied', 404);
    }

    // Delete from group
    const deleted = await db
      .delete(groupPapers)
      .where(and(eq(groupPapers.groupId, groupId), eq(groupPapers.paperId, paperId)))
      .returning();

    if (deleted.length === 0) {
      throw createError('Paper not in group', 404);
    }

    res.json({ message: 'Paper removed from group' });
  } catch (error) {
    next(error);
  }
});

/**
 * Ask question about paper (requires @ai trigger)
 */
router.post('/:groupId/papers/:paperId/question', async (req: AuthRequest, res: Response, next) => {
  try {
    const { groupId, paperId } = req.params;
    const { question, sessionId } = req.body;
    const userId = req.user!.id;

    if (!question) {
      throw createError('Question is required', 400);
    }

    // Validate @ai trigger
    if (!question.toLowerCase().includes('@ai')) {
      throw createError('Question must contain @ai trigger. AI only responds when triggered by @ai.', 400);
    }

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

    // Call AI service
    const response = await aiClient.paperQuestion({
      paper_id: paperId,
      question,
      group_id: groupId,
      session_id: sessionId,
      user_id: userId,
    });

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * Summarize paper (requires @ai trigger)
 */
router.post('/:groupId/papers/:paperId/summarize', async (req: AuthRequest, res: Response, next) => {
  try {
    const { groupId, paperId } = req.params;
    const { sessionId, trigger } = req.body;
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

    // Call AI service (trigger is defaulted if not provided)
    const response = await aiClient.paperSummarize({
      paper_id: paperId,
      group_id: groupId,
      session_id: sessionId,
      user_id: userId,
      trigger: trigger || '@ai summarize',
    });

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * Search group vectors
 */
router.post('/:groupId/search', async (req: AuthRequest, res: Response, next) => {
  try {
    const { groupId } = req.params;
    const { query, limit = 10, contentTypes, paperId } = req.body;
    const userId = req.user!.id;

    if (!query) {
      throw createError('Search query is required', 400);
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

    // Call AI service for vector search
    const response = await aiClient.searchVectors({
      group_id: groupId,
      query,
      limit,
      content_types: contentTypes,
      paper_id: paperId,
    });

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;
