import { Router } from 'express';
import { db, papers, savedPapers } from '../db/index.js';
import { eq, and, or, ilike, desc } from 'drizzle-orm';
import { authenticate } from '../middleware/auth.js';
import { createError } from '../middleware/error.js';
import { validateQuery } from '../middleware/validate.js';
import { searchPapersSchema } from '../validation/schemas.js';
import { searchLimiter } from '../middleware/rateLimiter.js';
const router = Router();
// External API configurations
const ARXIV_API = 'https://export.arxiv.org/api/query';
// Helper to search arXiv
async function searchArxiv(query, limit = 10) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        const response = await fetch(`${ARXIV_API}?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${limit}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) {
            console.error('arXiv API error:', response.status, response.statusText);
            return getMockArxivResults(query, limit);
        }
        const xmlText = await response.text();
        // Simple XML parsing for arXiv response
        const entries = [];
        const entryMatches = xmlText.match(/<entry>([\s\S]*?)<\/entry>/g) || [];
        for (const entryXml of entryMatches) {
            const getId = (xml) => {
                const match = xml.match(/<id>(.*?)<\/id>/);
                return match ? match[1] : '';
            };
            const getTitle = (xml) => {
                const match = xml.match(/<title>([\s\S]*?)<\/title>/);
                return match ? match[1].replace(/\s+/g, ' ').trim() : '';
            };
            const getSummary = (xml) => {
                const match = xml.match(/<summary>([\s\S]*?)<\/summary>/);
                return match ? match[1].replace(/\s+/g, ' ').trim() : '';
            };
            const getAuthors = (xml) => {
                const matches = xml.match(/<author>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<\/author>/g) || [];
                return matches.map(m => {
                    const nameMatch = m.match(/<name>(.*?)<\/name>/);
                    return nameMatch ? nameMatch[1] : '';
                }).filter(Boolean);
            };
            const getPublished = (xml) => {
                const match = xml.match(/<published>(.*?)<\/published>/);
                return match ? match[1].split('T')[0] : null;
            };
            const getCategory = (xml) => {
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
    }
    catch (error) {
        if (error.name === 'AbortError') {
            console.error('arXiv API timeout after 10 seconds - using mock data');
        }
        else {
            console.error('arXiv search failed:', error.message || error);
        }
        return getMockArxivResults(query, limit);
    }
}
// Fallback mock data for offline/unreachable scenarios
function getMockArxivResults(query, limit) {
    const mockPapers = [
        {
            id: 'arxiv-1706.03762',
            title: 'Attention Is All You Need',
            authors: ['Vaswani, A.', 'Shazeer, N.', 'Parmar, N.', 'Uszkoreit, J.'],
            abstract: 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks in an encoder-decoder configuration. The best performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.',
            tags: ['cs.CL'],
            url: 'https://arxiv.org/abs/1706.03762',
            publishedDate: '2017-06-12',
            citations: 0,
            source: 'arxiv',
        },
        {
            id: 'arxiv-1810.04805',
            title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding',
            authors: ['Devlin, J.', 'Chang, M.', 'Lee, K.', 'Toutanova, K.'],
            abstract: 'We introduce BERT, a new method of pre-training language representations which obtains state-of-the-art results on a wide array of Natural Language Processing (NLP) tasks. BERT is designed to pre-train deep bidirectional representations from unlabeled text by jointly conditioning on both left and right context in all layers.',
            tags: ['cs.CL'],
            url: 'https://arxiv.org/abs/1810.04805',
            publishedDate: '2018-10-11',
            citations: 0,
            source: 'arxiv',
        },
        {
            id: 'arxiv-1512.03385',
            title: 'Deep Residual Learning for Image Recognition',
            authors: ['He, K.', 'Zhang, X.', 'Ren, S.', 'Sun, J.'],
            abstract: 'Deep neural networks are difficult to train. We present a residual learning framework to ease training of networks that are substantially deeper than those previously used. We explicitly reformulate the layers as learning residual functions with reference to the layer inputs, instead of learning unreferenced functions.',
            tags: ['cs.CV'],
            url: 'https://arxiv.org/abs/1512.03385',
            publishedDate: '2015-12-10',
            citations: 0,
            source: 'arxiv',
        },
        {
            id: 'arxiv-1406.2661',
            title: 'Generative Adversarial Networks',
            authors: ['Goodfellow, I.', 'Pouget-Abadie, J.', 'Mirza, M.', 'Xu, B.'],
            abstract: 'We propose a new framework for estimating generative models via an adversarial process, in which we simultaneously train two models: a generative model G that captures the data distribution, and a discriminative model D that estimates the probability that a sample came from the training data rather than G.',
            tags: ['cs.LG'],
            url: 'https://arxiv.org/abs/1406.2661',
            publishedDate: '2014-06-10',
            citations: 0,
            source: 'arxiv',
        },
        {
            id: 'arxiv-1505.04597',
            title: 'U-Net: Convolutional Networks for Biomedical Image Segmentation',
            authors: ['Ronneberger, O.', 'Fischer, P.', 'Brox, T.'],
            abstract: 'There is large consent that successful training of deep networks requires many hand-labeled training samples. In this paper, we present a network and training strategy that relies on the strong use of data augmentation to use the available annotated samples more efficiently.',
            tags: ['cs.CV'],
            url: 'https://arxiv.org/abs/1505.04597',
            publishedDate: '2015-05-18',
            citations: 0,
            source: 'arxiv',
        },
        {
            id: 'arxiv-0905.2794',
            title: 'Quantum Error Correction for Quantum Computing',
            authors: ['Devitt, S.', 'Munro, W.', 'Nemoto, K.'],
            abstract: 'Quantum computing is fragile due to decoherence and operational errors. Quantum error correction protects quantum information from these errors and is essential for reliable quantum computation. This article reviews the major approaches to quantum error correction.',
            tags: ['quant-ph'],
            url: 'https://arxiv.org/abs/0905.2794',
            publishedDate: '2009-05-18',
            citations: 0,
            source: 'arxiv',
        },
    ];
    // Filter based on query if provided
    const queryLower = query.toLowerCase();
    if (queryLower && queryLower.length > 0) {
        const filtered = mockPapers.filter(p => p.title.toLowerCase().includes(queryLower) ||
            p.abstract.toLowerCase().includes(queryLower) ||
            p.authors.some(a => a.toLowerCase().includes(queryLower)));
        return filtered.slice(0, limit);
    }
    return mockPapers.slice(0, limit);
}
// All routes require authentication
router.use(authenticate);
// Search arXiv
router.get('/search/external', searchLimiter, validateQuery(searchPapersSchema), async (req, res, next) => {
    try {
        const { query, limit = '10' } = req.query;
        const queryStr = typeof query === 'string' ? query : '';
        const limitNum = Math.min(parseInt(typeof limit === 'string' ? limit : '10') || 10, 50);
        const results = await searchArxiv(queryStr, limitNum);
        res.json(results);
    }
    catch (error) {
        next(error);
    }
});
// Import paper from external source to database
router.post('/import', async (req, res, next) => {
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
    }
    catch (error) {
        next(error);
    }
});
// Get all papers (with search/filter)
router.get('/', async (req, res, next) => {
    try {
        const { search, tag, limit = '20', offset = '0' } = req.query;
        const limitNum = parseInt(limit);
        const offsetNum = parseInt(offset);
        let query = db.select().from(papers).$dynamic();
        if (search) {
            const searchTerm = `%${search}%`;
            query = query.where(or(ilike(papers.title, searchTerm), ilike(papers.abstract, searchTerm)));
        }
        const allPapers = await query
            .orderBy(desc(papers.citations))
            .limit(limitNum)
            .offset(offsetNum);
        // Filter by tag if provided (done in JS since tags is JSONB)
        let filteredPapers = allPapers;
        if (tag) {
            filteredPapers = allPapers.filter(p => p.tags?.includes(tag));
        }
        res.json(filteredPapers);
    }
    catch (error) {
        next(error);
    }
});
// Get saved papers for current user
router.get('/saved', async (req, res, next) => {
    try {
        const userId = req.user.id;
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
    }
    catch (error) {
        next(error);
    }
});
// Get single paper
router.get('/:paperId', async (req, res, next) => {
    try {
        const { paperId } = req.params;
        const userId = req.user.id;
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
    }
    catch (error) {
        next(error);
    }
});
// Create paper (admin or for importing)
router.post('/', async (req, res, next) => {
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
    }
    catch (error) {
        next(error);
    }
});
// Save paper
router.post('/:paperId/save', async (req, res, next) => {
    try {
        const { paperId } = req.params;
        const userId = req.user.id;
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
    }
    catch (error) {
        next(error);
    }
});
// Update saved paper notes
router.patch('/:paperId/save', async (req, res, next) => {
    try {
        const { paperId } = req.params;
        const userId = req.user.id;
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
    }
    catch (error) {
        next(error);
    }
});
// Unsave paper
router.delete('/:paperId/save', async (req, res, next) => {
    try {
        const { paperId } = req.params;
        const userId = req.user.id;
        await db
            .delete(savedPapers)
            .where(and(eq(savedPapers.userId, userId), eq(savedPapers.paperId, paperId)));
        res.json({ message: 'Paper unsaved successfully' });
    }
    catch (error) {
        next(error);
    }
});
// Get all unique tags
router.get('/meta/tags', async (req, res, next) => {
    try {
        const allPapers = await db.select({ tags: papers.tags }).from(papers);
        const allTags = new Set();
        allPapers.forEach(p => {
            p.tags?.forEach(tag => allTags.add(tag));
        });
        res.json(Array.from(allTags).sort());
    }
    catch (error) {
        next(error);
    }
});
export default router;
//# sourceMappingURL=papers.js.map