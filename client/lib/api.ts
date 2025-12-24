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

  async getSessionTasks(token: string, sessionId: string) {
    return this.request<Task[]>(`/api/sessions/${sessionId}/tasks`, { token });
  }

  async createTask(token: string, sessionId: string, data: { title: string; description?: string; assignedTo?: string }) {
    return this.request<Task>(`/api/sessions/${sessionId}/tasks`, {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    });
  }

  async updateTask(token: string, sessionId: string, taskId: string, data: Partial<Task>) {
    return this.request<Task>(`/api/sessions/${sessionId}/tasks/${taskId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(data),
    });
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

  // AI Features
  async getAIHealth() {
    return this.request<{ status: string; gemini_configured: boolean }>('/api/ai/health');
  }

  async summarizeSession(token: string, sessionId: string) {
    return this.request<{
      summary: string;
      key_points: string[];
      participant_count: number;
    }>(`/api/ai/summarize/${sessionId}`, {
      method: 'POST',
      token,
    });
  }

  async extractTasks(token: string, sessionId: string) {
    return this.request<{
      tasks: Array<{
        title: string;
        description?: string;
        assignee?: string;
        priority: 'low' | 'medium' | 'high';
      }>;
    }>(`/api/ai/extract-tasks/${sessionId}`, {
      method: 'POST',
      token,
    });
  }

  async askQuestion(token: string, sessionId: string, question: string) {
    return this.request<{
      answer: string;
      sources: string[];
    }>(`/api/ai/ask/${sessionId}`, {
      method: 'POST',
      token,
      body: JSON.stringify({ question }),
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
  metadata?: {
    isTask?: boolean;
    isSummary?: boolean;
  };
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

export interface Task {
  id: string;
  sessionId: string;
  title: string;
  description?: string;
  status: 'pending' | 'in-progress' | 'completed';
  assignedTo?: string;
  assigneeName?: string;
  createdAt: string;
}
