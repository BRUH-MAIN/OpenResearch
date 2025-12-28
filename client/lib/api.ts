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

  // External Paper Search (Semantic Scholar + arXiv)
  async searchExternalPapers(token: string, query: string, source: 'all' | 'semantic_scholar' | 'arxiv' = 'all', limit: number = 10) {
    const params = new URLSearchParams({ query, source, limit: limit.toString() });
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
  source: 'semantic_scholar' | 'arxiv';
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
