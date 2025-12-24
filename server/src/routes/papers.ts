import { Router, Response } from 'express';
import { db, papers, savedPapers, users } from '../db/index.js';
import { eq, and, or, ilike, desc } from 'drizzle-orm';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { createError } from '../middleware/error.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get all papers (with search/filter)
router.get('/', async (req: AuthRequest, res: Response, next) => {
  try {
    const { search, tag, limit = '20', offset = '0' } = req.query;
    const limitNum = parseInt(limit as string);
    const offsetNum = parseInt(offset as string);

    let query = db.select().from(papers).$dynamic();

    if (search) {
      const searchTerm = `%${search}%`;
      query = query.where(
        or(
          ilike(papers.title, searchTerm),
          ilike(papers.abstract, searchTerm)
        )
      );
    }

    const allPapers = await query
      .orderBy(desc(papers.citations))
      .limit(limitNum)
      .offset(offsetNum);

    // Filter by tag if provided (done in JS since tags is JSONB)
    let filteredPapers = allPapers;
    if (tag) {
      filteredPapers = allPapers.filter(p => 
        (p.tags as string[] | null)?.includes(tag as string)
      );
    }

    res.json(filteredPapers);
  } catch (error) {
    next(error);
  }
});

// Get saved papers for current user
router.get('/saved', async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.id;

    const userSavedPapers = await db
      .select({
        paper: papers,
        savedAt: savedPapers.savedAt,
        notes: savedPapers.notes,
        sessionId: savedPapers.sessionId,
      })
      .from(savedPapers)
      .innerJoin(papers, eq(papers.id, savedPapers.paperId))
      .where(eq(savedPapers.userId, userId))
      .orderBy(desc(savedPapers.savedAt));

    const formattedPapers = userSavedPapers.map(({ paper, savedAt, notes, sessionId }) => ({
      ...paper,
      savedAt,
      notes,
      sessionId,
    }));

    res.json(formattedPapers);
  } catch (error) {
    next(error);
  }
});

// Get single paper
router.get('/:paperId', async (req: AuthRequest, res: Response, next) => {
  try {
    const { paperId } = req.params;
    const userId = req.user!.id;

    const [paper] = await db
      .select()
      .from(papers)
      .where(eq(papers.id, paperId))
      .limit(1);

    if (!paper) {
      throw createError('Paper not found', 404);
    }

    // Check if saved by user
    const [saved] = await db
      .select()
      .from(savedPapers)
      .where(and(eq(savedPapers.userId, userId), eq(savedPapers.paperId, paperId)))
      .limit(1);

    res.json({
      ...paper,
      isSaved: !!saved,
      savedAt: saved?.savedAt,
      notes: saved?.notes,
    });
  } catch (error) {
    next(error);
  }
});

// Create paper (admin or for importing)
router.post('/', async (req: AuthRequest, res: Response, next) => {
  try {
    const { title, authors, abstract, tags, url, publishedDate, citations } = req.body;

    if (!title || !authors || !abstract || !url) {
      throw createError('Title, authors, abstract, and URL are required', 400);
    }

    const [newPaper] = await db
      .insert(papers)
      .values({
        title,
        authors,
        abstract,
        tags: tags || [],
        url,
        publishedDate,
        citations,
      })
      .returning();

    res.status(201).json(newPaper);
  } catch (error) {
    next(error);
  }
});

// Save paper
router.post('/:paperId/save', async (req: AuthRequest, res: Response, next) => {
  try {
    const { paperId } = req.params;
    const userId = req.user!.id;
    const { sessionId, notes } = req.body;

    // Check paper exists
    const [paper] = await db
      .select()
      .from(papers)
      .where(eq(papers.id, paperId))
      .limit(1);

    if (!paper) {
      throw createError('Paper not found', 404);
    }

    // Check if already saved
    const [existing] = await db
      .select()
      .from(savedPapers)
      .where(and(eq(savedPapers.userId, userId), eq(savedPapers.paperId, paperId)))
      .limit(1);

    if (existing) {
      throw createError('Paper already saved', 409);
    }

    await db.insert(savedPapers).values({
      userId,
      paperId,
      sessionId,
      notes,
    });

    res.status(201).json({ message: 'Paper saved successfully' });
  } catch (error) {
    next(error);
  }
});

// Update saved paper notes
router.patch('/:paperId/save', async (req: AuthRequest, res: Response, next) => {
  try {
    const { paperId } = req.params;
    const userId = req.user!.id;
    const { notes } = req.body;

    const [updated] = await db
      .update(savedPapers)
      .set({ notes })
      .where(and(eq(savedPapers.userId, userId), eq(savedPapers.paperId, paperId)))
      .returning();

    if (!updated) {
      throw createError('Saved paper not found', 404);
    }

    res.json({ message: 'Notes updated successfully' });
  } catch (error) {
    next(error);
  }
});

// Unsave paper
router.delete('/:paperId/save', async (req: AuthRequest, res: Response, next) => {
  try {
    const { paperId } = req.params;
    const userId = req.user!.id;

    await db
      .delete(savedPapers)
      .where(and(eq(savedPapers.userId, userId), eq(savedPapers.paperId, paperId)));

    res.json({ message: 'Paper unsaved successfully' });
  } catch (error) {
    next(error);
  }
});

// Get all unique tags
router.get('/meta/tags', async (req: AuthRequest, res: Response, next) => {
  try {
    const allPapers = await db.select({ tags: papers.tags }).from(papers);
    
    const allTags = new Set<string>();
    allPapers.forEach(p => {
      (p.tags as string[] | null)?.forEach(tag => allTags.add(tag));
    });

    res.json(Array.from(allTags).sort());
  } catch (error) {
    next(error);
  }
});

export default router;
