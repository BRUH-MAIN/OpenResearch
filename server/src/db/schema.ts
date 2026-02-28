import { pgTable, uuid, varchar, text, timestamp, integer, jsonb, primaryKey, boolean, customType } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Custom vector type for pgvector (SPECTER2 produces 768-dimensional vectors)
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(768)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    return value
      .replace('[', '')
      .replace(']', '')
      .split(',')
      .map((v) => parseFloat(v));
  },
});

// Users table
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }), // null for OAuth users
  avatar: text('avatar'),
  interests: jsonb('interests').$type<string[]>().default([]),
  googleId: varchar('google_id', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Groups table
export const groups = pgTable('groups', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description').notNull(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  avatar: text('avatar'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Group members junction table
export const groupMembers = pgTable('group_members', {
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 50 }).notNull().default('member'), // 'owner' | 'member'
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.groupId, table.userId] }),
}));

// Sessions table
export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 500 }).notNull(),
  status: varchar('status', { length: 50 }).notNull().default('active'), // 'active' | 'archived'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastActivityAt: timestamp('last_activity_at').defaultNow().notNull(),
});

// Messages table
export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }), // null for AI messages
  content: text('content').notNull(),
  type: varchar('type', { length: 50 }).notNull().default('user'), // 'user' | 'ai'
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Papers table
export const papers = pgTable('papers', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 1000 }).notNull(),
  authors: jsonb('authors').$type<string[]>().notNull(),
  abstract: text('abstract').notNull(),
  tags: jsonb('tags').$type<string[]>().default([]),
  url: text('url').notNull(),
  publishedDate: varchar('published_date', { length: 50 }),
  citations: integer('citations'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Saved papers junction table
export const savedPapers = pgTable('saved_papers', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  paperId: uuid('paper_id').notNull().references(() => papers.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
  notes: text('notes'),
  savedAt: timestamp('saved_at').defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.paperId] }),
}));

// Tasks table
export const tasks = pgTable('tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).notNull().default('pending'), // 'pending' | 'in-progress' | 'completed'
  assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  extractedFromMessageId: uuid('extracted_from_message_id').references(() => messages.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Refresh tokens table (for JWT refresh token rotation)
export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Friends table - bidirectional friendship
export const friends = pgTable('friends', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  friendId: uuid('friend_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Friend requests table
export const friendRequests = pgTable('friend_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  fromUserId: uuid('from_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  toUserId: uuid('to_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 50 }).notNull().default('pending'), // 'pending' | 'accepted' | 'rejected'
  message: text('message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Group invitations table
export const groupInvitations = pgTable('group_invitations', {
  id: uuid('id').defaultRandom().primaryKey(),
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  invitedBy: uuid('invited_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  invitedUserId: uuid('invited_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 50 }).notNull().default('pending'), // 'pending' | 'accepted' | 'declined'
  message: text('message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at'),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  ownedGroups: many(groups),
  groupMemberships: many(groupMembers),
  messages: many(messages),
  savedPapers: many(savedPapers),
  tasks: many(tasks),
  refreshTokens: many(refreshTokens),
  friends: many(friends),
  friendRequestsSent: many(friendRequests, { relationName: 'fromUser' }),
  friendRequestsReceived: many(friendRequests, { relationName: 'toUser' }),
  groupInvitationsReceived: many(groupInvitations, { relationName: 'invitedUser' }),
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
  owner: one(users, {
    fields: [groups.ownerId],
    references: [users.id],
  }),
  members: many(groupMembers),
  sessions: many(sessions),
  invitations: many(groupInvitations),
}));

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
  group: one(groups, {
    fields: [groupMembers.groupId],
    references: [groups.id],
  }),
  user: one(users, {
    fields: [groupMembers.userId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  group: one(groups, {
    fields: [sessions.groupId],
    references: [groups.id],
  }),
  messages: many(messages),
  tasks: many(tasks),
  savedPapers: many(savedPapers),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  session: one(sessions, {
    fields: [messages.sessionId],
    references: [sessions.id],
  }),
  user: one(users, {
    fields: [messages.userId],
    references: [users.id],
  }),
}));

export const papersRelations = relations(papers, ({ many }) => ({
  savedBy: many(savedPapers),
}));

export const savedPapersRelations = relations(savedPapers, ({ one }) => ({
  user: one(users, {
    fields: [savedPapers.userId],
    references: [users.id],
  }),
  paper: one(papers, {
    fields: [savedPapers.paperId],
    references: [papers.id],
  }),
  session: one(sessions, {
    fields: [savedPapers.sessionId],
    references: [sessions.id],
  }),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  session: one(sessions, {
    fields: [tasks.sessionId],
    references: [sessions.id],
  }),
  assignee: one(users, {
    fields: [tasks.assignedTo],
    references: [users.id],
  }),
  extractedFromMessage: one(messages, {
    fields: [tasks.extractedFromMessageId],
    references: [messages.id],
  }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

export const friendsRelations = relations(friends, ({ one }) => ({
  user: one(users, {
    fields: [friends.userId],
    references: [users.id],
  }),
  friend: one(users, {
    fields: [friends.friendId],
    references: [users.id],
  }),
}));

export const friendRequestsRelations = relations(friendRequests, ({ one }) => ({
  fromUser: one(users, {
    fields: [friendRequests.fromUserId],
    references: [users.id],
    relationName: 'fromUser',
  }),
  toUser: one(users, {
    fields: [friendRequests.toUserId],
    references: [users.id],
    relationName: 'toUser',
  }),
}));

export const groupInvitationsRelations = relations(groupInvitations, ({ one }) => ({
  group: one(groups, {
    fields: [groupInvitations.groupId],
    references: [groups.id],
  }),
  inviter: one(users, {
    fields: [groupInvitations.invitedBy],
    references: [users.id],
  }),
  invitedUser: one(users, {
    fields: [groupInvitations.invitedUserId],
    references: [users.id],
    relationName: 'invitedUser',
  }),
}));

// ============ Group Context Isolation Tables ============

// Group Papers - papers assigned to specific groups
export const groupPapers = pgTable('group_papers', {
  id: uuid('id').defaultRandom().primaryKey(),
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  paperId: uuid('paper_id').notNull().references(() => papers.id, { onDelete: 'cascade' }),
  addedBy: uuid('added_by').notNull().references(() => users.id, { onDelete: 'set null' }),
  fullText: text('full_text'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Group Paper Vectors - vector embeddings for group-isolated RAG
export const groupPaperVectors = pgTable('group_paper_vectors', {
  id: uuid('id').defaultRandom().primaryKey(),
  groupId: uuid('group_id').notNull(),
  paperId: text('paper_id').notNull(),
  contentType: varchar('content_type', { length: 50 }).notNull().default('paper'), // paper, qa, summary, memory, report
  contentId: text('content_id'),
  chunkIndex: integer('chunk_index').default(0),
  content: text('content'),
  embedding: vector('embedding'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Group Memory Notes - decisions, facts, internal guidelines
export const groupMemoryNotes = pgTable('group_memory_notes', {
  id: uuid('id').defaultRandom().primaryKey(),
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  content: text('content').notNull(),
  noteType: varchar('note_type', { length: 50 }).notNull().default('note'), // note, decision, guideline, fact
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// AI Artifacts - stores AI-generated content
export const aiArtifacts = pgTable('ai_artifacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
  paperId: uuid('paper_id').references(() => papers.id, { onDelete: 'set null' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  artifactType: varchar('artifact_type', { length: 50 }).notNull(), // qa, summary, session_summary, chat_response, report
  prompt: text('prompt'),
  content: text('content').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Group Reports - generated report metadata
export const groupReports = pgTable('group_reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 500 }).notNull(),
  reportType: varchar('report_type', { length: 50 }).notNull().default('weekly'), // 'weekly' | 'monthly' | 'custom'
  status: varchar('status', { length: 50 }).notNull().default('generating'), // 'generating' | 'completed' | 'failed'
  filePath: text('file_path'),
  fileSize: integer('file_size'),
  includeSessions: boolean('include_sessions').default(true),
  includePapers: boolean('include_papers').default(true),
  includeSummaries: boolean('include_summaries').default(true),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Relations for new tables
export const groupPapersRelations = relations(groupPapers, ({ one }) => ({
  group: one(groups, {
    fields: [groupPapers.groupId],
    references: [groups.id],
  }),
  paper: one(papers, {
    fields: [groupPapers.paperId],
    references: [papers.id],
  }),
  addedByUser: one(users, {
    fields: [groupPapers.addedBy],
    references: [users.id],
  }),
}));

export const groupMemoryNotesRelations = relations(groupMemoryNotes, ({ one }) => ({
  group: one(groups, {
    fields: [groupMemoryNotes.groupId],
    references: [groups.id],
  }),
  user: one(users, {
    fields: [groupMemoryNotes.userId],
    references: [users.id],
  }),
}));

export const aiArtifactsRelations = relations(aiArtifacts, ({ one }) => ({
  group: one(groups, {
    fields: [aiArtifacts.groupId],
    references: [groups.id],
  }),
  session: one(sessions, {
    fields: [aiArtifacts.sessionId],
    references: [sessions.id],
  }),
  paper: one(papers, {
    fields: [aiArtifacts.paperId],
    references: [papers.id],
  }),
  user: one(users, {
    fields: [aiArtifacts.userId],
    references: [users.id],
  }),
}));

export const groupReportsRelations = relations(groupReports, ({ one }) => ({
  group: one(groups, {
    fields: [groupReports.groupId],
    references: [groups.id],
  }),
  createdByUser: one(users, {
    fields: [groupReports.createdBy],
    references: [users.id],
  }),
}));
