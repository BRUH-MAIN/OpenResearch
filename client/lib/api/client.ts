import type {
  User, Group, GroupMember, Session, Message, Paper, ExternalPaper,
  SavedPaper, GroupInvitation, GroupPaper, PaperQAResponse, PaperSummaryResponse,
  VectorSearchResponse, ReportOptions, ReportGenerateResponse, Report,
} from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface RequestOptions extends RequestInit {
  token?: string;
}

export class ApiClient {
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

  // Auth — the refresh token lives in an httpOnly cookie set by the server;
  // it never appears in response bodies or client storage.
  async register(data: { name: string; email: string; password: string; interests?: string[] }) {
    return this.request<{
      user: User;
      accessToken: string;
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async login(email: string, password: string) {
    return this.request<{
      user: User;
      accessToken: string;
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async logout(token: string) {
    return this.request<{ message: string }>('/api/auth/logout', {
      method: 'POST',
      token,
    });
  }

  async refreshToken() {
    return this.request<{
      accessToken: string;
    }>('/api/auth/refresh', {
      method: 'POST',
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
    const response = await this.request<{ items: Group[]; cursor: string | null; hasMore: boolean }>('/api/groups', { token });
    return response.items;
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

  /**
   * Upload a paper PDF. The server extracts its text, saves the paper, and
   * embeds the full text into the group's vector namespace.
   *
   * Uses fetch directly rather than `request()` because the body is multipart:
   * the browser has to set the boundary itself, so no Content-Type here.
   */
  async uploadPaperPdf(token: string, groupId: string, file: File, title?: string) {
    const form = new FormData();
    form.append('file', file);
    if (title) form.append('title', title);

    const response = await fetch(`${this.baseUrl}/api/groups/${groupId}/papers/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error || 'Upload failed');
    }

    return response.json() as Promise<
      GroupPaper & {
        paper: Paper;
        pageCount: number;
        charCount: number;
        truncated: boolean;
        vectorsCreated: number;
      }
    >;
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

  // ==================== REPORTS ====================

  async generateGroupReport(token: string, groupId: string, options?: ReportOptions) {
    return this.request<ReportGenerateResponse>(`/api/reports/group/${groupId}/generate`, {
      method: 'POST',
      token,
      body: JSON.stringify(options || {}),
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

  async downloadReport(token: string, reportId: string): Promise<void> {
    const url = `${this.baseUrl}/api/reports/${reportId}/download`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    const disposition = response.headers.get('Content-Disposition');
    const filenameMatch = disposition?.match(/filename="?(.+?)"?$/);
    a.download = filenameMatch?.[1] || `report-${reportId}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  }
}

export const api = new ApiClient(API_URL);
