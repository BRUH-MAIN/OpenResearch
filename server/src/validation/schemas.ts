import { z } from 'zod';

// Auth validation schemas
export const registerSchema = z.object({
  name: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters')
    .trim(),
  email: z.string()
    .email('Invalid email address')
    .toLowerCase()
    .trim(),
  password: z.string()
    .min(6, 'Password must be at least 6 characters')
    .max(100, 'Password must be less than 100 characters'),
  interests: z.array(z.string()).optional(),
});

export const loginSchema = z.object({
  email: z.string()
    .email('Invalid email address')
    .toLowerCase()
    .trim(),
  password: z.string().min(1, 'Password is required'),
});

export const updateProfileSchema = z.object({
  name: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters')
    .trim()
    .optional(),
  avatar: z.string().url('Invalid avatar URL').optional().nullable(),
  interests: z.array(z.string()).optional(),
});

// Group validation schemas
export const createGroupSchema = z.object({
  name: z.string()
    .min(1, 'Group name is required')
    .max(255, 'Group name must be less than 255 characters')
    .trim(),
  description: z.string()
    .min(1, 'Description is required')
    .max(2000, 'Description must be less than 2000 characters')
    .trim(),
  avatar: z.string().url('Invalid avatar URL').optional().nullable(),
});

export const updateGroupSchema = z.object({
  name: z.string()
    .min(1, 'Group name is required')
    .max(255, 'Group name must be less than 255 characters')
    .trim()
    .optional(),
  description: z.string()
    .max(2000, 'Description must be less than 2000 characters')
    .trim()
    .optional(),
  avatar: z.string().url('Invalid avatar URL').optional().nullable(),
});

// Session validation schemas
export const createSessionSchema = z.object({
  groupId: z.string().uuid('Invalid group ID'),
  title: z.string()
    .min(1, 'Title is required')
    .max(500, 'Title must be less than 500 characters')
    .trim(),
});

export const updateSessionSchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(500, 'Title must be less than 500 characters')
    .trim()
    .optional(),
  status: z.enum(['active', 'archived']).optional(),
});

// Message validation schemas
export const sendMessageSchema = z.object({
  content: z.string()
    .min(1, 'Message content is required')
    .max(10000, 'Message must be less than 10000 characters'),
});

// Paper validation schemas
export const searchPapersSchema = z.object({
  query: z.string().min(1, 'Search query is required').max(500).optional(),
  q: z.string().min(1, 'Search query is required').max(500).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  offset: z.string().regex(/^\d+$/).transform(Number).optional(),
  source: z.enum(['local', 'arxiv']).optional(), // Keep for backward compatibility
}).refine(data => data.query || data.q, {
  message: 'Search query is required (use query or q parameter)',
});

export const savePaperSchema = z.object({
  paperId: z.string().uuid('Invalid paper ID').optional(),
  externalPaper: z.object({
    id: z.string(),
    title: z.string(),
    authors: z.array(z.string()),
    abstract: z.string(),
    url: z.string().url(),
    tags: z.array(z.string()).optional(),
    publishedDate: z.string().optional(),
    citations: z.number().optional(),
  }).optional(),
  notes: z.string().max(5000).optional(),
  sessionId: z.string().uuid().optional().nullable(),
});

// Group invitation validation schemas
export const sendGroupInviteSchema = z.object({
  invitedUserId: z.string().uuid('Invalid user ID').optional(),
  email: z.string().email('Invalid email address').optional(),
  message: z.string().max(500, 'Message must be less than 500 characters').optional(),
}).refine(
  (data) => data.invitedUserId || data.email,
  'Either invitedUserId or email is required'
);

export const addMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
});

// Group papers
export const addGroupPaperSchema = z.object({
  paperId: z.string().uuid('Invalid paper ID'),
  notes: z.string().max(5000).optional(),
});

export const paperQuestionSchema = z.object({
  question: z.string().min(1, 'Question is required').max(2000),
  sessionId: z.string().uuid().optional(),
});

export const paperSummarizeSchema = z.object({
  sessionId: z.string().uuid().optional(),
  trigger: z.string().max(200).optional(),
});

export const vectorSearchSchema = z.object({
  query: z.string().min(1, 'Search query is required').max(1000),
  limit: z.number().int().min(1).max(50).optional(),
  contentTypes: z.array(z.string()).optional(),
  paperId: z.string().optional(),
});

// Reports
export const generateReportSchema = z.object({
  reportType: z.enum(['weekly', 'monthly', 'custom']).optional(),
  dateRange: z.object({
    start: z.string().optional(),
    end: z.string().optional(),
  }).optional(),
  sections: z.array(z.string()).optional(),
  customTitle: z.string().max(500).optional(),
  paperIds: z.array(z.string().uuid()).optional(),
});

// ============ Socket.IO payload schemas ============

export const socketJoinSessionSchema = z.string().uuid('Invalid session ID');

export const socketSendMessageSchema = z.object({
  sessionId: z.string().uuid('Invalid session ID'),
  content: z.string()
    .min(1, 'Message content is required')
    .max(10000, 'Message must be less than 10000 characters'),
});

export const socketAgentRunSchema = z.object({
  sessionId: z.string().uuid('Invalid session ID'),
  content: z.string()
    .min(10, 'Give the agent something to investigate (at least 10 characters)')
    .max(2000),
});

export const socketPaperQuestionSchema = z.object({
  paperId: z.string().uuid('Invalid paper ID'),
  question: z.string().min(1).max(2000),
  groupId: z.string().uuid('Invalid group ID'),
  sessionId: z.string().uuid('Invalid session ID'),
});

export const socketPaperSummarizeSchema = z.object({
  paperId: z.string().uuid('Invalid paper ID'),
  groupId: z.string().uuid('Invalid group ID'),
  sessionId: z.string().uuid('Invalid session ID'),
});

// Common param schemas
export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

export const groupIdParamSchema = z.object({
  groupId: z.string().uuid('Invalid group ID format'),
});

export const sessionIdParamSchema = z.object({
  sessionId: z.string().uuid('Invalid session ID format'),
});

// Pagination query schema
export const paginationSchema = z.object({
  limit: z.string().regex(/^\d+$/).optional().default('50').transform(Number),
  offset: z.string().regex(/^\d+$/).optional().default('0').transform(Number),
});

// Export types
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

