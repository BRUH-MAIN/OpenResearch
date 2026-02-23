const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface RequestOptions extends RequestInit {
  token?: string;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const { token, ...fetchOptions } = options;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(fetchOptions.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...fetchOptions,
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  }

  // Auth
  async register(data: { name: string; email: string; password: string; interests?: string[] }) {
    return this.request<{
      user: User;
      accessToken: string;
      refreshToken: string;
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async login(email: string, password: string) {
    return this.request<{
      user: User;
      accessToken: string;
      refreshToken: string;
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async logout(token: string, refreshToken: string) {
    return this.request<{ message: string }>('/api/auth/logout', {
      method: 'POST',
      token,
      body: JSON.stringify({ refreshToken }),
    });
  }

  async refreshToken(refreshToken: string) {
    return this.request<{
      accessToken: string;
      refreshToken: string;
    }>('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  }

  async getMe(token: string) {
    return this.request<User>('/api/auth/me', { token });
  }

  async updateMe(token: string, data: Partial<User>) {
    return this.request<User>('/api/auth/me', {
      method: 'PATCH',
      token,
      body: JSON.stringify(data),
    });
  }

  // Groups
  async getGroups(token: string) {
    return this.request<Group[]>('/api/groups', { token });
  }

  async getGroup(token: string, groupId: string) {
    return this.request<Group & { memberCount: number; userRole: string }>(`/api/groups/${groupId}`, { token });
  }

  async createGroup(token: string, data: { name: string; description: string; avatar?: string }) {
    return this.request<Group>('/api/groups', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    });
  }

  async updateGroup(token: string, groupId: string, data: Partial<Group>) {
    return this.request<Group>(`/api/groups/${groupId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(data),
    });
  }

  async deleteGroup(token: string, groupId: string) {
    return this.request<{ message: string }>(`/api/groups/${groupId}`, {
      method: 'DELETE',
      token,
    });
  }

  async getGroupMembers(token: string, groupId: string) {
    return this.request<GroupMember[]>(`/api/groups/${groupId}/members`, { token });
  }

  async addGroupMember(token: string, groupId: string, email: string) {
    return this.request<GroupMember>(`/api/groups/${groupId}/members`, {
      method: 'POST',
      token,
      body: JSON.stringify({ email }),
    });
  }

  async removeGroupMember(token: string, groupId: string, userId: string) {
    return this.request<{ message: string }>(`/api/groups/${groupId}/members/${userId}`, {
      method: 'DELETE',
      token,
    });
  }

  // Sessions
  async getGroupSessions(token: string, groupId: string) {
    return this.request<Session[]>(`/api/sessions/group/${groupId}`, { token });
  }

  async getSession(token: string, sessionId: string) {
    return this.request<Session & { messageCount: number }>(`/api/sessions/${sessionId}`, { token });
  }

  async createSession(token: string, groupId: string, title: string) {
    return this.request<Session>('/api/sessions', {
      method: 'POST',
      token,
      body: JSON.stringify({ groupId, title }),
    });
  }

  async updateSession(token: string, sessionId: string, data: { title?: string; status?: string }) {
    return this.request<Session>(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(data),
    });
  }

  async deleteSession(token: string, sessionId: string) {
    return this.request<{ message: string }>(`/api/sessions/${sessionId}`, {
      method: 'DELETE',
      token,
    });
  }

  async getSessionMessages(token: string, sessionId: string, limit = 50, offset = 0) {
    return this.request<Message[]>(`/api/sessions/${sessionId}/messages?limit=${limit}&offset=${offset}`, { token });
  }

  // Papers
  async getPapers(token: string, search?: string, tag?: string) {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (tag) params.set('tag', tag);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return this.request<Paper[]>(`/api/papers${queryString}`, { token });
  }

  async getSavedPapers(token: string) {
    return this.request<(Paper & { savedAt: string; notes?: string })[]>('/api/papers/saved', { token });
  }

  async getPaper(token: string, paperId: string) {
    return this.request<Paper & { isSaved: boolean; notes?: string }>(`/api/papers/${paperId}`, { token });
  }

  async savePaper(token: string, paperId: string, sessionId?: string, notes?: string) {
    return this.request<{ message: string }>(`/api/papers/${paperId}/save`, {
      method: 'POST',
      token,
      body: JSON.stringify({ sessionId, notes }),
    });
  }

  async unsavePaper(token: string, paperId: string) {
    return this.request<{ message: string }>(`/api/papers/${paperId}/save`, {
      method: 'DELETE',
      token,
    });
  }

  async getPaperTags(token: string) {
    return this.request<string[]>('/api/papers/meta/tags', { token });
  }

  // External Paper Search (arXiv)
  async searchExternalPapers(token: string, query: string, source: 'arxiv' = 'arxiv', limit: number = 10) {
    const params = new URLSearchParams({ query, limit: limit.toString() });
    return this.request<ExternalPaper[]>(`/api/papers/search/external?${params.toString()}`, { token });
  }

  async importPaper(token: string, paper: ExternalPaper) {
    return this.request<Paper & { alreadyExists?: boolean }>('/api/papers/import', {
      method: 'POST',
      token,
      body: JSON.stringify(paper),
    });
  }

  // ==================== GROUP INVITATIONS ====================

  async getPendingInvitations(token: string) {
    return this.request<GroupInvitation[]>('/api/groups/invitations/pending', { token });
  }

  async getGroupInvitations(token: string, groupId: string) {
    return this.request<GroupInvitation[]>(`/api/groups/${groupId}/invitations`, { token });
  }

  async inviteToGroupByEmail(token: string, groupId: string, email: string, message?: string) {
    return this.request<GroupInvitation>(`/api/groups/${groupId}/invitations`, {
      method: 'POST',
      token,
      body: JSON.stringify({ email, message }),
    });
  }

  async acceptGroupInvitation(token: string, invitationId: string) {
    return this.request<{ message: string; group: Group }>(`/api/groups/invitations/${invitationId}/accept`, {
      method: 'POST',
      token,
    });
  }

  async declineGroupInvitation(token: string, invitationId: string) {
    return this.request<{ message: string }>(`/api/groups/invitations/${invitationId}/decline`, {
      method: 'POST',
      token,
    });
  }

  async cancelGroupInvitation(token: string, groupId: string, invitationId: string) {
    return this.request<{ message: string }>(`/api/groups/${groupId}/invitations/${invitationId}`, {
      method: 'DELETE',
      token,
    });
  }

  // ==================== MESSAGE MANAGEMENT ====================

  async deleteMessage(token: string, sessionId: string, messageId: string) {
    return this.request<{ message: string }>(`/api/sessions/${sessionId}/messages/${messageId}`, {
      method: 'DELETE',
      token,
    });
  }

  async clearSessionMessages(token: string, sessionId: string) {
    return this.request<{ message: string }>(`/api/sessions/${sessionId}/messages`, {
      method: 'DELETE',
      token,
    });
  }

  // ==================== GROUP PAPERS (with RAG) ====================

  async getGroupPapers(token: string, groupId: string) {
    return this.request<GroupPaper[]>(`/api/groups/${groupId}/papers`, { token });
  }

  async addPaperToGroup(token: string, groupId: string, paperId: string, notes?: string) {
    return this.request<GroupPaper & { message: string }>(`/api/groups/${groupId}/papers`, {
      method: 'POST',
      token,
      body: JSON.stringify({ paperId, notes }),
    });
  }

  async removePaperFromGroup(token: string, groupId: string, paperId: string) {
    return this.request<{ message: string }>(`/api/groups/${groupId}/papers/${paperId}`, {
      method: 'DELETE',
      token,
    });
  }

  async askPaperQuestion(token: string, groupId: string, paperId: string, question: string, sessionId?: string) {
    return this.request<PaperQAResponse>(`/api/groups/${groupId}/papers/${paperId}/question`, {
      method: 'POST',
      token,
      body: JSON.stringify({ question, sessionId }),
    });
  }

  async summarizePaper(token: string, groupId: string, paperId: string, sessionId?: string) {
    return this.request<PaperSummaryResponse>(`/api/groups/${groupId}/papers/${paperId}/summarize`, {
      method: 'POST',
      token,
      body: JSON.stringify({ sessionId }),
    });
  }

  async searchGroupVectors(token: string, groupId: string, query: string, options?: { limit?: number; contentTypes?: string[] }) {
    return this.request<VectorSearchResponse>(`/api/groups/${groupId}/search`, {
      method: 'POST',
      token,
      body: JSON.stringify({ query, ...options }),
    });
  }

  // ==================== RECOMMENDATIONS ====================

  async getRecommendationsForUser(token: string, limit = 10) {
    return this.request<RecommendationsResponse>(`/api/recommendations/user?limit=${limit}`, { token });
  }

  async getRecommendationsForGroup(token: string, groupId: string, limit = 10) {
    return this.request<RecommendationsResponse>(`/api/recommendations/group/${groupId}?limit=${limit}`, { token });
  }

  async getSimilarPapers(token: string, paperId: string, options?: { groupId?: string; limit?: number }) {
    const params = new URLSearchParams();
    if (options?.groupId) params.set('groupId', options.groupId);
    if (options?.limit) params.set('limit', options.limit.toString());
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return this.request<SimilarPapersResponse>(`/api/recommendations/similar/${paperId}${queryString}`, { token });
  }

  async getTrendingPapers(token: string) {
    return this.request<TrendingPapersResponse>('/api/recommendations/trending', { token });
  }

  // ==================== REPORTS ====================

  async generateGroupReport(token: string, groupId: string, options?: ReportOptions) {
    return this.request<ReportGenerateResponse>(`/api/reports/group/${groupId}/generate`, {
      method: 'POST',
      token,
      body: JSON.stringify(options || {}),
    });
  }

  // ==================== AGENTIC TASKS ====================

  async runAgenticTask(
    token: string,
    data: {
      taskType: AgenticTaskType;
      prompt: string;
      groupId?: string;
      sessionId?: string;
      paperIds?: string[];
      options?: Record<string, unknown>;
      agenticRunId?: string;
    }
  ) {
    return this.request<AgenticRunResponse>('/api/ai/agentic/run', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    });
  }

  async getGroupReports(token: string, groupId: string) {
    return this.request<Report[]>(`/api/reports/group/${groupId}`, { token });
  }

  async getReport(token: string, reportId: string) {
    return this.request<Report>(`/api/reports/${reportId}`, { token });
  }

  async deleteReport(token: string, reportId: string) {
    return this.request<{ message: string }>(`/api/reports/${reportId}`, {
      method: 'DELETE',
      token,
    });
  }

  getReportDownloadUrl(reportId: string): string {
    return `${this.baseUrl}/api/reports/${reportId}/download`;
  }
}

export const api = new ApiClient(API_URL);

// Types
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

// ==================== RECOMMENDATIONS TYPES ====================

export interface PaperRecommendation extends Paper {
  score: number;
  reason: string;
}

export interface RecommendationsResponse {
  recommendations: PaperRecommendation[];
  total: number;
  source?: string;
}

export interface SimilarPapersResponse {
  similar: Array<Paper & { similarityScore: number; reason: string }>;
  total: number;
  source: 'vector' | 'tags';
}

export interface TrendingPapersResponse {
  trending: Array<Paper & { trendScore: number; groupCount?: number; reason: string }>;
  total: number;
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

// ==================== AGENTIC TYPES ====================

export type AgenticTaskType =
  | 'paper_retrieval'
  | 'literature_survey'
  | 'gap_analysis'
  | 'fact_check'
  | 'novelty_assessment'
  | 'research_mentor'
  | 'paper_writing'
  | 'research_planning'
  | 'deep_research';

export interface AgenticRunResponse {
  task_type: AgenticTaskType;
  result: Record<string, unknown>;
  artifacts: string[];
  metadata: Record<string, unknown>;
  latency_ms: number;
}
