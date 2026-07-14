/**
 * Group Papers Routes
 *
 * API endpoints for managing papers within groups and group-isolated RAG.
 */

import { Router, Response } from 'express';
import { db, groupPapers, papers } from '../db/index.js';
import { eq, and, desc } from 'drizzle-orm';
import { authenticate } from '../middleware/auth.js';
import { requireGroupMember, GroupRequest } from '../middleware/groupAccess.js';
import { validate } from '../middleware/validate.js';
import { addGroupPaperSchema, paperQuestionSchema, paperSummarizeSchema, vectorSearchSchema } from '../validation/schemas.js';
import { createError } from '../middleware/error.js';
import { aiClient } from '../services/aiClient.js';
import logger from '../utils/logger.js';

const router = Router();

// All routes require authentication + group membership
router.use(authenticate);
router.use('/:groupId', requireGroupMember);

/**
 * Get all papers in a group
 */
router.get('/:groupId/papers', async (req: GroupRequest, res: Response, next) => {
  try {
    const { groupId } = req.params;

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
router.post('/:groupId/papers', validate(addGroupPaperSchema), async (req: GroupRequest, res: Response, next) => {
  try {
    const { groupId } = req.params;
    const { paperId, notes } = req.body;
    const userId = req.user!.id;

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
      logger.warn({ err: aiError, paperId, groupId }, 'Failed to generate paper embeddings');
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
router.delete('/:groupId/papers/:paperId', async (req: GroupRequest, res: Response, next) => {
  try {
    const { groupId, paperId } = req.params;

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
router.post('/:groupId/papers/:paperId/question', validate(paperQuestionSchema), async (req: GroupRequest, res: Response, next) => {
  try {
    const { groupId, paperId } = req.params;
    const { question, sessionId } = req.body;

    // Validate @ai trigger
    if (!question.toLowerCase().includes('@ai')) {
      throw createError('Question must contain @ai trigger. AI only responds when triggered by @ai.', 400);
    }

    // Pre-check AI service availability
    const isAvailable = await aiClient.isAvailable();
    if (!isAvailable) {
      throw createError('AI service is not available. Please check the AI service configuration.', 503);
    }

    const response = await aiClient.paperQuestion({
      paper_id: paperId,
      question,
      group_id: groupId,
      session_id: sessionId,
      user_id: req.user!.id,
    });

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * Summarize paper (requires @ai trigger)
 */
router.post('/:groupId/papers/:paperId/summarize', validate(paperSummarizeSchema), async (req: GroupRequest, res: Response, next) => {
  try {
    const { groupId, paperId } = req.params;
    const { sessionId, trigger } = req.body;

    // Pre-check AI service availability
    const isAvailable = await aiClient.isAvailable();
    if (!isAvailable) {
      throw createError('AI service is not available. Please check the AI service configuration.', 503);
    }

    const response = await aiClient.paperSummarize({
      paper_id: paperId,
      group_id: groupId,
      session_id: sessionId,
      user_id: req.user!.id,
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
router.post('/:groupId/search', validate(vectorSearchSchema), async (req: GroupRequest, res: Response, next) => {
  try {
    const { groupId } = req.params;
    const { query, limit = 10, contentTypes, paperId } = req.body;

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
