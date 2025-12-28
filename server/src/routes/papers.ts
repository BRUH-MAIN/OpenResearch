import { Router, Response } from 'express';
import { db, papers, savedPapers, users } from '../db/index.js';
import { eq, and, or, ilike, desc } from 'drizzle-orm';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { createError } from '../middleware/error.js';
import { validateQuery } from '../middleware/validate.js';
import { searchPapersSchema } from '../validation/schemas.js';
import { searchLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// External API configurations
const SEMANTIC_SCHOLAR_API = 'https://api.semanticscholar.org/graph/v1';
const ARXIV_API = 'https://export.arxiv.org/api/query';

// Types for external APIs
interface SemanticScholarPaper {
  paperId: string;
  title: string;
  abstract: string | null;
  authors: { name: string }[];
  year: number | null;
  citationCount: number;
  url: string;
  fieldsOfStudy: string[] | null;
  publicationDate: string | null;
}

// Helper to search Semantic Scholar
async function searchSemanticScholar(query: string, limit: number = 10): Promise<any[]> {
  try {
    const fields = 'paperId,title,abstract,authors,year,citationCount,url,fieldsOfStudy,publicationDate';
    const response = await fetch(
      `${SEMANTIC_SCHOLAR_API}/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=${fields}`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error('Semantic Scholar API error:', response.status);
      return [];
    }

    const data = await response.json() as { data?: SemanticScholarPaper[] };
    
    return (data.data || []).map((paper: SemanticScholarPaper) => ({
      id: `ss-${paper.paperId}`,
      title: paper.title,
      authors: paper.authors?.map(a => a.name) || [],
      abstract: paper.abstract || 'No abstract available',
      tags: paper.fieldsOfStudy || [],
      url: paper.url || `https://www.semanticscholar.org/paper/${paper.paperId}`,
      publishedDate: paper.publicationDate || (paper.year ? `${paper.year}-01-01` : null),
      citations: paper.citationCount || 0,
      source: 'semantic_scholar',
    }));
  } catch (error) {
    console.error('Semantic Scholar search failed:', error);
    return [];
  }
}

// Helper to search arXiv
async function searchArxiv(query: string, limit: number = 10): Promise<any[]> {
  try {
    const response = await fetch(
      `${ARXIV_API}?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${limit}`
    );

    if (!response.ok) {
      console.error('arXiv API error:', response.status);
      return [];
    }

    const xmlText = await response.text();
    
    // Simple XML parsing for arXiv response
    const entries: any[] = [];
    const entryMatches = xmlText.match(/<entry>([\s\S]*?)<\/entry>/g) || [];
    
    for (const entryXml of entryMatches) {
      const getId = (xml: string) => {
        const match = xml.match(/<id>(.*?)<\/id>/);
        return match ? match[1] : '';
      };
      const getTitle = (xml: string) => {
        const match = xml.match(/<title>([\s\S]*?)<\/title>/);
        return match ? match[1].replace(/\s+/g, ' ').trim() : '';
      };
      const getSummary = (xml: string) => {
        const match = xml.match(/<summary>([\s\S]*?)<\/summary>/);
        return match ? match[1].replace(/\s+/g, ' ').trim() : '';
      };
      const getAuthors = (xml: string) => {
        const matches = xml.match(/<author>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<\/author>/g) || [];
        return matches.map(m => {
          const nameMatch = m.match(/<name>(.*?)<\/name>/);
          return nameMatch ? nameMatch[1] : '';
        }).filter(Boolean);
      };
      const getPublished = (xml: string) => {
        const match = xml.match(/<published>(.*?)<\/published>/);
        return match ? match[1].split('T')[0] : null;
      };
      const getCategory = (xml: string) => {
        const match = xml.match(/<arxiv:primary_category[^>]*term="([^"]+)"/);
        return match ? [match[1]] : [];
      };

      const id = getId(entryXml);
      const arxivId = id.split('/abs/').pop()?.split('v')[0] || id;
      
      entries.push({
        id: `arxiv-${arxivId}`,
        title: getTitle(entryXml),
        authors: getAuthors(entryXml),
        abstract: getSummary(entryXml),
        tags: getCategory(entryXml),
        url: id,
        publishedDate: getPublished(entryXml),
        citations: 0, // arXiv doesn't provide citation count
        source: 'arxiv',
      });
    }

    return entries;
  } catch (error) {
    console.error('arXiv search failed:', error);
    return [];
  }
}

// All routes require authentication
router.use(authenticate);

// Search external APIs (Semantic Scholar + arXiv)
router.get('/search/external', searchLimiter, validateQuery(searchPapersSchema), async (req: AuthRequest, res: Response, next) => {
  try {
    const { query, source = 'all', limit = '10' } = req.query;
    
    const queryStr = typeof query === 'string' ? query : '';
    const sourceStr = typeof source === 'string' ? source : 'all';
    const limitNum = Math.min(parseInt(typeof limit === 'string' ? limit : '10') || 10, 50);
    const results: any[] = [];

    if (sourceStr === 'all' || sourceStr === 'semantic_scholar') {
      const ssPapers = await searchSemanticScholar(queryStr, limitNum);
      results.push(...ssPapers);
    }

    if (sourceStr === 'all' || sourceStr === 'arxiv') {
      const arxivPapers = await searchArxiv(queryStr, limitNum);
      results.push(...arxivPapers);
    }

    // Sort by citations (descending)
    results.sort((a, b) => (b.citations || 0) - (a.citations || 0));

    res.json(results.slice(0, limitNum * 2)); // Return up to 2x limit when using both sources
  } catch (error) {
    next(error);
  }
});

// Import paper from external source to database
router.post('/import', async (req: AuthRequest, res: Response, next) => {
  try {
    const { title, authors, abstract, tags, url, publishedDate, citations } = req.body;

    if (!title || !url) {
      throw createError('Title and URL are required', 400);
    }

    // Check if paper already exists by URL
    const [existing] = await db
      .select()
      .from(papers)
      .where(eq(papers.url, url))
      .limit(1);

    if (existing) {
      res.json({ ...existing, alreadyExists: true });
      return;
    }

    const [newPaper] = await db
      .insert(papers)
      .values({
        title,
        authors: authors || [],
        abstract: abstract || 'No abstract available',
        tags: tags || [],
        url,
        publishedDate,
        citations: citations || 0,
      })
      .returning();

    res.status(201).json(newPaper);
  } catch (error) {
    next(error);
  }
});

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
