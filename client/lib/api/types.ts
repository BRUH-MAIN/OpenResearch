/**
 * API response shapes, mirrored by hand from the server's Drizzle schema
 * and the AI service's Pydantic models. Kept in one place so the fetch layer
 * below stays about transport, not data.
 */

/** A retrieved chunk that grounded an AI answer — rendered as a citation chip. */
export interface RagSource {
  id: string;
  type: string;
  title: string;
  url: string;
  similarity: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  interests: string[];
  createdAt: string;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  avatar?: string;
  createdAt: string;
  memberCount?: number;
  role?: string;
}

export interface GroupMember {
  userId: string;
  name: string;
  email: string;
  avatar?: string;
  role: string;
  joinedAt: string;
}

export interface Session {
  id: string;
  groupId: string;
  title: string;
  status: 'active' | 'archived';
  createdAt: string;
  lastActivityAt: string;
  messageCount?: number;
}

export interface Message {
  id: string;
  sessionId: string;
  userId: string | null;
  content: string;
  type: 'user' | 'ai';
  createdAt: string;
  userName?: string;
  userAvatar?: string;
  metadata?: Record<string, unknown>;
}

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  tags: string[];
  url: string;
  publishedDate?: string;
  citations?: number;
}

export interface ExternalPaper extends Paper {
  source: 'arxiv';
}

export interface SavedPaper extends Paper {
  savedAt: string;
  notes?: string;
}

export interface GroupInvitation {
  id: string;
  groupId: string;
  groupName?: string;
  groupDescription?: string;
  groupAvatar?: string;
  invitedUserId: string;
  invitedUserName?: string;
  invitedUserEmail?: string;
  invitedByUserId: string;
  invitedByUserName?: string;
  inviterName?: string;
  inviterAvatar?: string;
  message?: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  expiresAt?: string;
  createdAt: string;
}

// ==================== GROUP PAPERS & AI TYPES ====================

export interface GroupPaper {
  id: string;
  paperId: string;
  notes?: string;
  addedAt: string;
  title: string;
  authors: string[];
  abstract: string;
  tags: string[];
  url?: string;
  publishedDate?: string;
}

export interface PaperQAResponse {
  answer: string;
  paper_id: string;
  group_id: string;
  question: string;
  context_sources: string[];
  latency_ms: number;
}

export interface PaperSummaryResponse {
  summary: string;
  paper_id: string;
  group_id: string;
  key_points: string[];
  latency_ms: number;
}

export interface VectorSearchResponse {
  results: Array<{
    id: string;
    paper_id: string;
    content_type: string;
    content: string;
    similarity: number;
  }>;
  total: number;
  group_id: string;
  latency_ms: number;
}

// ==================== REPORTS TYPES ====================

export interface ReportOptions {
  reportType?: 'weekly' | 'monthly' | 'custom';
  dateRange?: {
    start?: string;
    end?: string;
  };
  sections?: string[];
  customTitle?: string;
  paperIds?: string[];
}

export interface ReportGenerateResponse {
  reportId: string;
  title: string;
  status: 'completed' | 'generating' | 'failed';
  downloadUrl: string | null;
  reportPath?: string;
  summary?: string;
  createdAt: string;
}

export interface Report {
  id: string;
  groupId: string;
  title: string;
  reportType: 'weekly' | 'monthly' | 'custom';
  status: 'completed' | 'generating' | 'failed';
  filePath?: string;
  metadata?: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  downloadUrl?: string | null;
}
