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
            { name: 'AI', description: 'AI-powered chat & agentic tasks' },
            { name: 'Reports', description: 'Group report generation & retrieval' },
            { name: 'Recommendations', description: 'AI-powered paper recommendations' },
        ]
    },
    apis: ['./src/routes/*.ts'], // read swagger docs from route files
};

export const swaggerSpec = swaggerJsdoc(options);
