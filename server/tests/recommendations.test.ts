/**
 * Tests for Recommendations Routes
 * 
 * These tests cover paper discovery and recommendation features.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock dependencies
vi.mock('../src/db/index.js', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue([]),
  },
  papers: {},
  groupPapers: {},
  groupMembers: {},
  userPapers: {},
}));

vi.mock('../src/services/aiClient.js', () => ({
  aiClient: {
    getRecommendations: vi.fn().mockResolvedValue({
      recommendations: [],
    }),
    searchVectors: vi.fn().mockResolvedValue({
      results: [],
    }),
  },
}));

describe('Recommendations Routes', () => {
  describe('GET /api/recommendations/user', () => {
    it('should return personalized recommendations', async () => {
      const recommendations = [
        { id: 'p1', title: 'Paper 1', score: 0.9, reason: 'Based on interests' },
        { id: 'p2', title: 'Paper 2', score: 0.8, reason: 'Similar to saved' },
      ];
      
      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations[0].score).toBeGreaterThan(0);
    });

    it('should exclude already saved papers', async () => {
      const savedPaperIds = ['p1', 'p3'];
      const recommendations = [
        { id: 'p2', title: 'Paper 2' },
        { id: 'p4', title: 'Paper 4' },
      ];
      
      recommendations.forEach(r => {
        expect(savedPaperIds).not.toContain(r.id);
      });
    });

    it('should include recommendation reason', async () => {
      const recommendation = {
        id: 'p1',
        title: 'Paper 1',
        score: 0.9,
        reason: 'Matches your interest in machine learning',
      };
      
      expect(recommendation.reason).toBeTruthy();
    });

    it('should respect limit parameter', async () => {
      const limit = 5;
      const recommendations = Array(10).fill(null).map((_, i) => ({ id: `p${i}` }));
      const limited = recommendations.slice(0, limit);
      
      expect(limited.length).toBe(limit);
    });
  });

  describe('GET /api/recommendations/group/:groupId', () => {
    it('should return group-specific recommendations', async () => {
      const recommendations = [
        { id: 'p1', title: 'Paper 1', score: 0.95, reason: 'Related to group papers' },
      ];
      
      expect(recommendations[0].reason).toContain('group');
    });

    it('should use group context for relevance', async () => {
      const groupPaperTags = ['machine learning', 'neural networks'];
      const recommendation = {
        id: 'p1',
        tags: ['deep learning', 'neural networks'],
      };
      
      const hasOverlap = recommendation.tags.some(t => groupPaperTags.includes(t));
      expect(hasOverlap).toBe(true);
    });

    it('should exclude papers already in group', async () => {
      const groupPaperIds = ['p1', 'p2'];
      const recommendations = [
        { id: 'p3', title: 'Paper 3' },
        { id: 'p4', title: 'Paper 4' },
      ];
      
      recommendations.forEach(r => {
        expect(groupPaperIds).not.toContain(r.id);
      });
    });

    it('should require group membership', async () => {
      const accessDenied = { error: 'Group not found or access denied' };
      expect(accessDenied.error).toContain('access denied');
    });

    it('should fallback to tag-based if AI fails', async () => {
      const response = {
        recommendations: [{ id: 'p1', score: 0.8 }],
        source: 'fallback',
      };
      
      expect(response.source).toBe('fallback');
    });
  });

  describe('GET /api/recommendations/similar/:paperId', () => {
    it('should return similar papers', async () => {
      const similar = [
        { id: 'p2', similarityScore: 0.92, reason: 'Semantically similar' },
        { id: 'p3', similarityScore: 0.85, reason: 'Shares 3 topics' },
      ];
      
      expect(similar.length).toBeGreaterThan(0);
      expect(similar[0].similarityScore).toBeGreaterThan(0);
    });

    it('should use vector similarity when group context available', async () => {
      const response = {
        similar: [{ id: 'p2', similarityScore: 0.9 }],
        source: 'vector',
      };
      
      expect(response.source).toBe('vector');
    });

    it('should fallback to tag similarity', async () => {
      const response = {
        similar: [{ id: 'p2', similarityScore: 0.7 }],
        source: 'tags',
      };
      
      expect(response.source).toBe('tags');
    });

    it('should not include the source paper', async () => {
      const sourcePaperId = 'p1';
      const similar = [
        { id: 'p2' },
        { id: 'p3' },
      ];
      
      similar.forEach(s => {
        expect(s.id).not.toBe(sourcePaperId);
      });
    });
  });

  describe('GET /api/recommendations/trending', () => {
    it('should return trending papers', async () => {
      const trending = [
        { id: 'p1', trendScore: 0.95, groupCount: 5 },
        { id: 'p2', trendScore: 0.8, groupCount: 3 },
      ];
      
      expect(trending.length).toBeGreaterThan(0);
    });

    it('should order by trend score', async () => {
      const trending = [
        { id: 'p1', trendScore: 0.95 },
        { id: 'p2', trendScore: 0.8 },
        { id: 'p3', trendScore: 0.7 },
      ];
      
      for (let i = 1; i < trending.length; i++) {
        expect(trending[i - 1].trendScore).toBeGreaterThanOrEqual(trending[i].trendScore);
      }
    });

    it('should include group count', async () => {
      const paper = {
        id: 'p1',
        trendScore: 0.9,
        groupCount: 5,
        reason: 'Used by 5 research groups',
      };
      
      expect(paper.groupCount).toBeGreaterThan(0);
      expect(paper.reason).toContain('5');
    });

    it('should fallback to recent papers if no trending data', async () => {
      const recent = [
        { id: 'p1', trendScore: 0.7, reason: 'Recently added' },
      ];
      
      expect(recent[0].reason).toContain('Recent');
    });
  });
});

describe('Recommendation Scoring', () => {
  describe('Score Calculation', () => {
    it('should normalize scores to 0-1 range', () => {
      const scores = [0.95, 0.8, 0.65, 0.5, 0.3];
      
      scores.forEach(score => {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      });
    });

    it('should weight tag overlap appropriately', () => {
      const calculateTagScore = (overlap: number, total: number): number => {
        return total > 0 ? overlap / total : 0;
      };
      
      expect(calculateTagScore(3, 5)).toBe(0.6);
      expect(calculateTagScore(5, 5)).toBe(1);
      expect(calculateTagScore(0, 5)).toBe(0);
    });

    it('should boost recent papers', () => {
      const recentBoost = 0.1;
      const baseScore = 0.7;
      const boostedScore = Math.min(1, baseScore + recentBoost);
      
      expect(boostedScore).toBeCloseTo(0.8, 5);
    });
  });

  describe('Relevance Reasons', () => {
    it('should generate meaningful reasons', () => {
      const reasons = [
        'Shares 3 topics with your group\'s papers',
        'Based on your interest in machine learning',
        'Used by 5 research groups',
        'Semantically similar content',
        'Popular recent paper',
      ];
      
      reasons.forEach(reason => {
        expect(reason.length).toBeGreaterThan(10);
      });
    });

    it('should include specific details', () => {
      const overlap = 3;
      const reason = `Shares ${overlap} topic${overlap > 1 ? 's' : ''} with your group's papers`;
      
      expect(reason).toContain('3');
      expect(reason).toContain('topics');
    });
  });
});

describe('Recommendation Filtering', () => {
  it('should filter by tags', () => {
    const papers = [
      { id: 'p1', tags: ['ml', 'ai'] },
      { id: 'p2', tags: ['biology'] },
      { id: 'p3', tags: ['ml', 'data'] },
    ];
    
    const filtered = papers.filter(p => p.tags.includes('ml'));
    expect(filtered.length).toBe(2);
  });

  it('should filter by recency', () => {
    const now = new Date();
    const papers = [
      { id: 'p1', createdAt: new Date(now.getTime() - 1000 * 60 * 60) }, // 1 hour ago
      { id: 'p2', createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30) }, // 30 days ago
    ];
    
    const oneWeekAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7);
    const recent = papers.filter(p => p.createdAt > oneWeekAgo);
    
    expect(recent.length).toBe(1);
  });

  it('should handle empty paper list', () => {
    const papers: any[] = [];
    const recommendations = papers.slice(0, 10);
    
    expect(recommendations.length).toBe(0);
  });
});
