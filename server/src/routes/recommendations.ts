/**
 * Recommendations Routes
 * 
 * API endpoints for paper discovery and recommendations.
 */

import { Router, Response } from 'express';
import { db, papers, groupPapers, groupMembers, savedPapers } from '../db/index.js';
import { eq, and, desc, sql, notInArray, inArray } from 'drizzle-orm';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { createError } from '../middleware/error.js';
import { aiClient } from '../services/aiClient.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * Get personalized paper recommendations for user
 */
router.get('/user', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 10;

    // Get user's existing papers
    const userPaperIds = await db
      .select({ paperId: savedPapers.paperId })
      .from(savedPapers)
      .where(eq(savedPapers.userId, userId));

    const existingIds = userPaperIds.map(p => p.paperId);

    // Get papers user hasn't seen yet, ordered by recency
    const recommendations = existingIds.length > 0
      ? await db
          .select()
          .from(papers)
          .where(notInArray(papers.id, existingIds))
          .orderBy(desc(papers.createdAt))
          .limit(limit)
      : await db
          .select()
          .from(papers)
          .orderBy(desc(papers.createdAt))
          .limit(limit);

    res.json({
      recommendations: recommendations.map(p => ({
        ...p,
        score: 0.8, // Placeholder score
        reason: 'New paper in your areas of interest',
      })),
      total: recommendations.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get recommendations for a group based on group context
 */
router.get('/group/:groupId', async (req: AuthRequest, res: Response, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 10;

    // Verify membership
    const [membership] = await db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
      .limit(1);

    if (!membership) {
      throw createError('Group not found or access denied', 404);
    }

    // Get papers already in group
    const groupPaperIds = await db
      .select({ paperId: groupPapers.paperId })
      .from(groupPapers)
      .where(eq(groupPapers.groupId, groupId));

    const existingIds = groupPaperIds.map(p => p.paperId);

    // Try to get AI-powered recommendations
    try {
      const aiRecommendations = await aiClient.getRecommendations({
        group_id: groupId,
        limit,
        exclude_paper_ids: existingIds,
      });

      if (aiRecommendations.recommendations && aiRecommendations.recommendations.length > 0) {
        res.json(aiRecommendations);
        return;
      }
    } catch (aiError) {
      console.error('AI recommendations failed, falling back:', aiError);
    }

    // Fallback: recommend papers similar to those in group by tags
    let recommendations: any[] = [];

    if (existingIds.length > 0) {
      // Get tags from existing papers
      const existingPapers = await db
        .select({ tags: papers.tags })
        .from(papers)
        .where(inArray(papers.id, existingIds));

      const allTags = new Set<string>();
      existingPapers.forEach(p => {
        if (Array.isArray(p.tags)) {
          p.tags.forEach((tag: string) => allTags.add(tag));
        }
      });

      // Find papers with similar tags
      const candidatePapers = await db
        .select()
        .from(papers)
        .where(notInArray(papers.id, existingIds))
        .orderBy(desc(papers.createdAt))
        .limit(limit * 3); // Get more to filter

      // Score by tag overlap
      const tagArray = Array.from(allTags);
      recommendations = candidatePapers
        .map(p => {
          const paperTags = Array.isArray(p.tags) ? p.tags : [];
          const overlap = paperTags.filter((t: string) => tagArray.includes(t)).length;
          const score = tagArray.length > 0 ? overlap / tagArray.length : 0.5;
          return {
            ...p,
            score: Math.min(1, score + 0.3), // Boost base score
            reason: overlap > 0
              ? `Shares ${overlap} topic${overlap > 1 ? 's' : ''} with your group's papers`
              : 'New paper that might interest your group',
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    } else {
      // No papers yet, recommend top recent papers
      recommendations = (await db
        .select()
        .from(papers)
        .orderBy(desc(papers.createdAt))
        .limit(limit))
        .map(p => ({
          ...p,
          score: 0.7,
          reason: 'Popular recent paper',
        }));
    }

    res.json({
      recommendations,
      total: recommendations.length,
      source: 'fallback',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get similar papers to a specific paper
 */
router.get('/similar/:paperId', async (req: AuthRequest, res: Response, next) => {
  try {
    const { paperId } = req.params;
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 5;
    const groupId = req.query.groupId as string;

    // Get paper
    const [paper] = await db
      .select()
      .from(papers)
      .where(eq(papers.id, paperId))
      .limit(1);

    if (!paper) {
      throw createError('Paper not found', 404);
    }

    // Try AI-powered similarity search
    if (groupId) {
      // Verify membership
      const [membership] = await db
        .select()
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
        .limit(1);

      if (!membership) {
        throw createError('Group not found or access denied', 404);
      }

      try {
        const similarResults = await aiClient.searchVectors({
          group_id: groupId,
          query: paper.abstract || paper.title,
          limit: limit + 1, // +1 to exclude self
          content_types: ['paper'],
        });

        if (similarResults.results && similarResults.results.length > 0) {
          // Filter out the source paper and get paper details
          const filteredResults = similarResults.results
            .filter((r: any) => r.paper_id !== paperId)
            .slice(0, limit);

          const similarPaperIds = filteredResults.map((r: any) => r.paper_id);
          
          if (similarPaperIds.length > 0) {
            const similarPapers = await db
              .select()
              .from(papers)
              .where(inArray(papers.id, similarPaperIds));

            const papersWithScores = similarPapers.map(p => {
              const result = filteredResults.find((r: any) => r.paper_id === p.id);
              return {
                ...p,
                similarityScore: result?.similarity || 0.8,
                reason: 'Semantically similar content',
              };
            });

            res.json({
              similar: papersWithScores,
              total: papersWithScores.length,
              source: 'vector',
            });
            return;
          }
        }
      } catch (aiError) {
        console.error('Vector similarity search failed:', aiError);
      }
    }

    // Fallback: find papers with similar tags
    const paperTags = Array.isArray(paper.tags) ? paper.tags : [];
    
    const allPapers = await db
      .select()
      .from(papers)
      .where(sql`${papers.id} != ${paperId}`)
      .limit(100);

    const similar = allPapers
      .map(p => {
        const pTags = Array.isArray(p.tags) ? p.tags : [];
        const overlap = pTags.filter((t: string) => paperTags.includes(t)).length;
        const score = paperTags.length > 0 ? overlap / paperTags.length : 0;
        return {
          ...p,
          similarityScore: score,
          reason: overlap > 0
            ? `Shares ${overlap} topic${overlap > 1 ? 's' : ''}`
            : 'May be related',
        };
      })
      .filter(p => p.similarityScore > 0)
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, limit);

    res.json({
      similar,
      total: similar.length,
      source: 'tags',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Discover trending papers
 */
router.get('/trending', async (_req: AuthRequest, res: Response, next) => {
  try {
    const limit = 20;

    // Get papers that are in many groups (popular)
    const popularPapers = await db
      .select({
        paperId: groupPapers.paperId,
        groupCount: sql<number>`count(distinct ${groupPapers.groupId})`,
      })
      .from(groupPapers)
      .groupBy(groupPapers.paperId)
      .orderBy(sql`count(distinct ${groupPapers.groupId}) desc`)
      .limit(limit);

    if (popularPapers.length === 0) {
      // No group papers yet, return recent
      const recent = await db
        .select()
        .from(papers)
        .orderBy(desc(papers.createdAt))
        .limit(limit);

      res.json({
        trending: recent.map((p, i) => ({
          ...p,
          trendScore: 1 - (i * 0.05),
          reason: 'Recently added',
        })),
        total: recent.length,
      });
      return;
    }

    const paperIds = popularPapers.map(p => p.paperId);
    const paperDetails = await db
      .select()
      .from(papers)
      .where(inArray(papers.id, paperIds));

    const trending = paperDetails.map(p => {
      const pop = popularPapers.find(pp => pp.paperId === p.id);
      return {
        ...p,
        trendScore: pop ? Math.min(1, pop.groupCount * 0.2) : 0.5,
        groupCount: pop?.groupCount || 0,
        reason: `Used by ${pop?.groupCount || 0} research group${(pop?.groupCount || 0) > 1 ? 's' : ''}`,
      };
    }).sort((a, b) => b.trendScore - a.trendScore);

    res.json({
      trending,
      total: trending.length,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
