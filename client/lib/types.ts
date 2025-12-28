// Core type definitions for OpenResearch

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
  memberCount: number;
  createdAt: string;
  avatar?: string;
}

export interface GroupMember {
  groupId: string;
  userId: string;
  role: 'owner' | 'member';
  joinedAt: string;
}

export interface Session {
  id: string;
  groupId: string;
  title: string;
  status: 'active' | 'archived';
  createdAt: string;
  lastActivityAt: string;
  messageCount: number;
}

export interface Message {
  id: string;
  sessionId: string;
  userId: string;
  content: string;
  timestamp: string;
  type: 'user' | 'ai';
}

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  tags: string[];
  url: string;
  publishedDate: string;
  citations?: number;
}

export interface SavedPaper extends Paper {
  savedAt: string;
  notes?: string;
}

// Group invitation types
export interface GroupInvitation {
  id: string;
  groupId: string;
  groupName?: string;
  groupAvatar?: string;
  groupDescription?: string;
  invitedBy: string;
  inviterName?: string;
  inviterAvatar?: string;
  invitedUserId?: string;
  invitedUserName?: string;
  invitedUserEmail?: string;
  status: 'pending' | 'accepted' | 'declined';
  message?: string;
  createdAt: string;
  expiresAt?: string;
}
