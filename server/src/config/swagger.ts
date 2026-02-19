/**
 * OpenAPI / Swagger Configuration
 *
 * Serves interactive API documentation at /api-docs.
 */

import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.3',
        info: {
            title: 'OpenResearch API',
            version: '1.0.0',
            description:
                'REST API for the OpenResearch collaborative research platform. Provides authentication, group management, research sessions, AI-powered chat & analysis, paper management, and report generation.',
            contact: { name: 'OpenResearch Team' },
        },
        servers: [
            { url: 'http://localhost:3001', description: 'Development' },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'Access token obtained from /api/auth/login or /api/auth/register',
                },
            },
            schemas: {
                Error: {
                    type: 'object',
                    properties: {
                        error: { type: 'string' },
                        message: { type: 'string' },
                    },
                },
                User: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        name: { type: 'string' },
                        email: { type: 'string', format: 'email' },
                        avatar: { type: 'string', nullable: true },
                        interests: { type: 'array', items: { type: 'string' } },
                        createdAt: { type: 'string', format: 'date-time' },
                    },
                },
                Group: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        name: { type: 'string' },
                        description: { type: 'string' },
                        avatar: { type: 'string', nullable: true },
                        createdAt: { type: 'string', format: 'date-time' },
                    },
                },
                Session: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        groupId: { type: 'string', format: 'uuid' },
                        title: { type: 'string' },
                        status: { type: 'string', enum: ['active', 'archived'] },
                        createdAt: { type: 'string', format: 'date-time' },
                        lastActivityAt: { type: 'string', format: 'date-time' },
                        messageCount: { type: 'integer' },
                    },
                },
                Message: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        sessionId: { type: 'string', format: 'uuid' },
                        userId: { type: 'string', format: 'uuid', nullable: true },
                        content: { type: 'string' },
                        type: { type: 'string', enum: ['user', 'ai', 'system'] },
                        metadata: { type: 'object', nullable: true },
                        createdAt: { type: 'string', format: 'date-time' },
                    },
                },
                Paper: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        arxivId: { type: 'string' },
                        title: { type: 'string' },
                        authors: { type: 'array', items: { type: 'string' } },
                        abstract: { type: 'string' },
                        publishedDate: { type: 'string', format: 'date-time' },
                        categories: { type: 'array', items: { type: 'string' } },
                        pdfUrl: { type: 'string' },
                    },
                },
                ChatResponse: {
                    type: 'object',
                    properties: {
                        answer: { type: 'string' },
                        sources: { type: 'array', items: { type: 'string' } },
                        model: { type: 'string' },
                        latency_ms: { type: 'number' },
                        context_messages_used: { type: 'integer' },
                        papers_used: { type: 'integer' },
                    },
                },
                SummaryResponse: {
                    type: 'object',
                    properties: {
                        summary: { type: 'string' },
                        key_points: { type: 'array', items: { type: 'string' } },
                        participant_count: { type: 'integer' },
                        message_count: { type: 'integer' },
                        model: { type: 'string' },
                        latency_ms: { type: 'number' },
                    },
                },
                HealthStatus: {
                    type: 'object',
                    properties: {
                        status: { type: 'string', enum: ['healthy', 'unhealthy'] },
                        timestamp: { type: 'string', format: 'date-time' },
                        uptime: { type: 'number' },
                        services: {
                            type: 'object',
                            properties: { database: { type: 'string' } },
                        },
                        version: { type: 'string' },
                    },
                },
            },
        },
        tags: [
            { name: 'Health', description: 'Service health checks' },
            { name: 'Auth', description: 'Authentication & user management' },
            { name: 'Groups', description: 'Research group management' },
            { name: 'Sessions', description: 'Research session management' },
            { name: 'Papers', description: 'Academic paper search & management' },
            { name: 'AI', description: 'AI-powered chat, Q&A, summarization & agentic tasks' },
            { name: 'Reports', description: 'Group report generation & retrieval' },
            { name: 'Recommendations', description: 'AI-powered paper recommendations' },
        ],
        paths: {
            // ── Health ──────────────────────────────────────────────
            '/health/': {
                get: {
                    tags: ['Health'],
                    summary: 'Basic health check',
                    responses: { 200: { description: 'Healthy', content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthStatus' } } } } },
                },
            },
            '/health/detailed': {
                get: {
                    tags: ['Health'],
                    summary: 'Detailed health with memory & latency',
                    responses: { 200: { description: 'Detailed status' } },
                },
            },
            '/health/live': {
                get: { tags: ['Health'], summary: 'Liveness probe', responses: { 200: { description: 'Alive' } } },
            },
            '/health/ready': {
                get: { tags: ['Health'], summary: 'Readiness probe', responses: { 200: { description: 'Ready' }, 503: { description: 'Not ready' } } },
            },

            // ── Auth ────────────────────────────────────────────────
            '/api/auth/register': {
                post: {
                    tags: ['Auth'],
                    summary: 'Register a new user',
                    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'email', 'password'], properties: { name: { type: 'string' }, email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 6 }, interests: { type: 'array', items: { type: 'string' } } } } } } },
                    responses: { 201: { description: 'User created with tokens' }, 409: { description: 'Email already exists' } },
                },
            },
            '/api/auth/login': {
                post: {
                    tags: ['Auth'],
                    summary: 'Login with credentials',
                    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } } } } },
                    responses: { 200: { description: 'Login successful with tokens' }, 401: { description: 'Invalid credentials' } },
                },
            },
            '/api/auth/me': {
                get: {
                    tags: ['Auth'],
                    summary: 'Get current user profile',
                    security: [{ bearerAuth: [] }],
                    responses: { 200: { description: 'User profile', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } } },
                },
                patch: {
                    tags: ['Auth'],
                    summary: 'Update current user profile',
                    security: [{ bearerAuth: [] }],
                    requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, interests: { type: 'array', items: { type: 'string' } } } } } } },
                    responses: { 200: { description: 'Updated user' } },
                },
            },
            '/api/auth/refresh': {
                post: {
                    tags: ['Auth'],
                    summary: 'Refresh access token',
                    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } } } } },
                    responses: { 200: { description: 'New token pair' }, 401: { description: 'Invalid refresh token' } },
                },
            },
            '/api/auth/logout': {
                post: {
                    tags: ['Auth'],
                    summary: 'Logout (revoke refresh token)',
                    security: [{ bearerAuth: [] }],
                    responses: { 200: { description: 'Logged out' } },
                },
            },

            // ── Groups ──────────────────────────────────────────────
            '/api/groups': {
                get: {
                    tags: ['Groups'], summary: 'List user groups', security: [{ bearerAuth: [] }],
                    responses: { 200: { description: 'Array of groups' } },
                },
                post: {
                    tags: ['Groups'], summary: 'Create a group', security: [{ bearerAuth: [] }],
                    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, description: { type: 'string' } } } } } },
                    responses: { 201: { description: 'Group created' } },
                },
            },
            '/api/groups/{groupId}': {
                get: {
                    tags: ['Groups'], summary: 'Get group details', security: [{ bearerAuth: [] }],
                    parameters: [{ name: 'groupId', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: { 200: { description: 'Group details' }, 404: { description: 'Not found' } },
                },
                patch: {
                    tags: ['Groups'], summary: 'Update group', security: [{ bearerAuth: [] }],
                    parameters: [{ name: 'groupId', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: { 200: { description: 'Updated group' } },
                },
                delete: {
                    tags: ['Groups'], summary: 'Delete group (owner only)', security: [{ bearerAuth: [] }],
                    parameters: [{ name: 'groupId', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: { 200: { description: 'Group deleted' } },
                },
            },
            '/api/groups/{groupId}/members': {
                post: {
                    tags: ['Groups'], summary: 'Add member by email', security: [{ bearerAuth: [] }],
                    parameters: [{ name: 'groupId', in: 'path', required: true, schema: { type: 'string' } }],
                    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email'], properties: { email: { type: 'string' } } } } } },
                    responses: { 201: { description: 'Member added' }, 409: { description: 'Already a member' } },
                },
            },

            // ── Sessions ────────────────────────────────────────────
            '/api/sessions': {
                post: {
                    tags: ['Sessions'], summary: 'Create a session', security: [{ bearerAuth: [] }],
                    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['groupId', 'title'], properties: { groupId: { type: 'string' }, title: { type: 'string' } } } } } },
                    responses: { 201: { description: 'Session created' } },
                },
            },
            '/api/sessions/group/{groupId}': {
                get: {
                    tags: ['Sessions'], summary: 'List group sessions', security: [{ bearerAuth: [] }],
                    parameters: [{ name: 'groupId', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: { 200: { description: 'Array of sessions' } },
                },
            },
            '/api/sessions/{sessionId}': {
                get: {
                    tags: ['Sessions'], summary: 'Get session details', security: [{ bearerAuth: [] }],
                    parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: { 200: { description: 'Session details' } },
                },
                patch: {
                    tags: ['Sessions'], summary: 'Update session (title/status)', security: [{ bearerAuth: [] }],
                    parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: { 200: { description: 'Updated session' } },
                },
                delete: {
                    tags: ['Sessions'], summary: 'Delete session', security: [{ bearerAuth: [] }],
                    parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: { 200: { description: 'Session deleted' } },
                },
            },
            '/api/sessions/{sessionId}/messages': {
                get: {
                    tags: ['Sessions'], summary: 'Get session messages', security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } },
                        { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
                        { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
                    ],
                    responses: { 200: { description: 'Array of messages' } },
                },
                delete: {
                    tags: ['Sessions'], summary: 'Clear all messages (owner only)', security: [{ bearerAuth: [] }],
                    parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: { 200: { description: 'Messages cleared' } },
                },
            },

            // ── Papers ──────────────────────────────────────────────
            '/api/papers/search': {
                get: {
                    tags: ['Papers'], summary: 'Search arXiv papers', security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
                        { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
                    ],
                    responses: { 200: { description: 'Search results' } },
                },
            },
            '/api/papers/trending': {
                get: {
                    tags: ['Papers'], summary: 'Get trending papers',
                    responses: { 200: { description: 'Trending papers' } },
                },
            },

            // ── Group Papers ────────────────────────────────────────
            '/api/groups/{groupId}/papers': {
                get: {
                    tags: ['Papers'], summary: 'List group papers', security: [{ bearerAuth: [] }],
                    parameters: [{ name: 'groupId', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: { 200: { description: 'Array of papers' } },
                },
                post: {
                    tags: ['Papers'], summary: 'Add paper to group', security: [{ bearerAuth: [] }],
                    parameters: [{ name: 'groupId', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: { 201: { description: 'Paper added' } },
                },
            },

            // ── AI ──────────────────────────────────────────────────
            '/api/ai/health': {
                get: { tags: ['AI'], summary: 'AI service health', responses: { 200: { description: 'AI status' }, 503: { description: 'Unavailable' } } },
            },
            '/api/ai/chat': {
                post: {
                    tags: ['AI'], summary: 'Chat Q&A (60 req/min)', security: [{ bearerAuth: [] }],
                    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['question'], properties: { question: { type: 'string' }, sessionId: { type: 'string' }, includePapers: { type: 'boolean', default: true } } } } } },
                    responses: { 200: { description: 'Chat answer', content: { 'application/json': { schema: { $ref: '#/components/schemas/ChatResponse' } } } }, 429: { description: 'Rate limited' } },
                },
            },
            '/api/ai/ask/{sessionId}': {
                post: {
                    tags: ['AI'], summary: 'Ask in session context (handles @ai prefix)', security: [{ bearerAuth: [] }],
                    parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
                    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['question'], properties: { question: { type: 'string' } } } } } },
                    responses: { 200: { description: 'AI answer' } },
                },
            },
            '/api/ai/summarize/{sessionId}': {
                post: {
                    tags: ['AI'], summary: 'Summarize session (10 req/min)', security: [{ bearerAuth: [] }],
                    parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: { 200: { description: 'Summary', content: { 'application/json': { schema: { $ref: '#/components/schemas/SummaryResponse' } } } } },
                },
            },
            '/api/ai/agentic/run': {
                post: {
                    tags: ['AI'], summary: 'Run agentic research task (5 req/min)', security: [{ bearerAuth: [] }],
                    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['taskType', 'prompt'], properties: { taskType: { type: 'string', enum: ['paper_retrieval', 'literature_survey', 'gap_analysis', 'fact_check', 'novelty_assessment', 'research_mentor', 'paper_writing', 'research_planning', 'deep_research'] }, prompt: { type: 'string' }, groupId: { type: 'string' }, sessionId: { type: 'string' }, paperIds: { type: 'array', items: { type: 'string' } } } } } } },
                    responses: { 200: { description: 'Task result' }, 429: { description: 'Rate limited' } },
                },
            },

            // ── Reports ─────────────────────────────────────────────
            '/api/reports/group/{groupId}/generate': {
                post: {
                    tags: ['Reports'], summary: 'Generate group report (5 req/hr)', security: [{ bearerAuth: [] }],
                    parameters: [{ name: 'groupId', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: { 201: { description: 'Report generated' }, 429: { description: 'Rate limited' }, 503: { description: 'AI unavailable' } },
                },
            },
            '/api/reports/group/{groupId}': {
                get: {
                    tags: ['Reports'], summary: 'List group reports', security: [{ bearerAuth: [] }],
                    parameters: [{ name: 'groupId', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: { 200: { description: 'Array of reports' } },
                },
            },
            '/api/reports/{reportId}': {
                get: {
                    tags: ['Reports'], summary: 'Get report details', security: [{ bearerAuth: [] }],
                    parameters: [{ name: 'reportId', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: { 200: { description: 'Report details' } },
                },
                delete: {
                    tags: ['Reports'], summary: 'Delete report (creator only)', security: [{ bearerAuth: [] }],
                    parameters: [{ name: 'reportId', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: { 200: { description: 'Report deleted' } },
                },
            },

            // ── Recommendations ─────────────────────────────────────
            '/api/recommendations/{groupId}': {
                get: {
                    tags: ['Recommendations'], summary: 'Get paper recommendations for group', security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: 'groupId', in: 'path', required: true, schema: { type: 'string' } },
                        { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
                    ],
                    responses: { 200: { description: 'Recommendations' } },
                },
            },
        },
    },
    apis: [], // specs defined inline above
};

export const swaggerSpec = swaggerJsdoc(options);
