import { User, Group, Session, Message, Paper, SavedPaper, Task, GroupMember } from './types';

// Mock Users
export const mockUsers: User[] = [
  {
    id: 'user-1',
    name: 'Alice Johnson',
    email: 'alice@example.com',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alice',
    interests: ['Machine Learning', 'NLP', 'Computer Vision'],
    createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: 'user-2',
    name: 'Bob Smith',
    email: 'bob@example.com',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bob',
    interests: ['Quantum Computing', 'Algorithms', 'Cryptography'],
    createdAt: '2024-02-20T14:30:00Z',
  },
  {
    id: 'user-3',
    name: 'Carol Williams',
    email: 'carol@example.com',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Carol',
    interests: ['Bioinformatics', 'Data Science', 'Healthcare AI'],
    createdAt: '2024-03-10T09:15:00Z',
  },
  {
    id: 'user-4',
    name: 'David Chen',
    email: 'david@example.com',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=David',
    interests: ['Robotics', 'Reinforcement Learning', 'Computer Vision'],
    createdAt: '2024-04-05T16:45:00Z',
  },
];

// Mock Groups
export const mockGroups: Group[] = [
  {
    id: 'group-1',
    name: 'AI Research Lab',
    description: 'Exploring cutting-edge AI and machine learning research',
    ownerId: 'user-1',
    memberCount: 4,
    createdAt: '2024-05-01T10:00:00Z',
    avatar: 'https://api.dicebear.com/7.x/shapes/svg?seed=AILab',
  },
  {
    id: 'group-2',
    name: 'Quantum Computing Group',
    description: 'Advancing quantum algorithms and error correction',
    ownerId: 'user-2',
    memberCount: 3,
    createdAt: '2024-05-15T14:00:00Z',
    avatar: 'https://api.dicebear.com/7.x/shapes/svg?seed=Quantum',
  },
  {
    id: 'group-3',
    name: 'Healthcare Innovation',
    description: 'AI applications in medicine and healthcare',
    ownerId: 'user-3',
    memberCount: 5,
    createdAt: '2024-06-01T09:00:00Z',
    avatar: 'https://api.dicebear.com/7.x/shapes/svg?seed=Health',
  },
  {
    id: 'group-4',
    name: 'Computer Vision Lab',
    description: 'Image processing and visual recognition research',
    ownerId: 'user-1',
    memberCount: 6,
    createdAt: '2024-06-20T11:30:00Z',
    avatar: 'https://api.dicebear.com/7.x/shapes/svg?seed=Vision',
  },
];

// Mock Group Members
export const mockGroupMembers: GroupMember[] = [
  { groupId: 'group-1', userId: 'user-1', role: 'owner', joinedAt: '2024-05-01T10:00:00Z' },
  { groupId: 'group-1', userId: 'user-2', role: 'member', joinedAt: '2024-05-02T10:00:00Z' },
  { groupId: 'group-1', userId: 'user-3', role: 'member', joinedAt: '2024-05-03T10:00:00Z' },
  { groupId: 'group-1', userId: 'user-4', role: 'member', joinedAt: '2024-05-04T10:00:00Z' },
  { groupId: 'group-2', userId: 'user-2', role: 'owner', joinedAt: '2024-05-15T14:00:00Z' },
  { groupId: 'group-2', userId: 'user-1', role: 'member', joinedAt: '2024-05-16T14:00:00Z' },
  { groupId: 'group-3', userId: 'user-3', role: 'owner', joinedAt: '2024-06-01T09:00:00Z' },
  { groupId: 'group-4', userId: 'user-1', role: 'owner', joinedAt: '2024-06-20T11:30:00Z' },
];

// Mock Sessions
export const mockSessions: Session[] = [
  {
    id: 'session-1',
    groupId: 'group-1',
    title: 'Transformer Architecture Discussion',
    status: 'active',
    createdAt: '2024-07-01T10:00:00Z',
    lastActivityAt: '2024-12-18T08:30:00Z',
    messageCount: 24,
  },
  {
    id: 'session-2',
    groupId: 'group-1',
    title: 'RLHF Implementation Strategy',
    status: 'active',
    createdAt: '2024-08-15T14:00:00Z',
    lastActivityAt: '2024-12-17T15:20:00Z',
    messageCount: 18,
  },
  {
    id: 'session-3',
    groupId: 'group-1',
    title: 'Paper Review: Attention Is All You Need',
    status: 'archived',
    createdAt: '2024-06-10T09:00:00Z',
    lastActivityAt: '2024-09-10T18:00:00Z',
    messageCount: 42,
  },
  {
    id: 'session-4',
    groupId: 'group-2',
    title: 'Quantum Error Correction Codes',
    status: 'active',
    createdAt: '2024-09-01T11:00:00Z',
    lastActivityAt: '2024-12-18T09:15:00Z',
    messageCount: 31,
  },
  {
    id: 'session-5',
    groupId: 'group-2',
    title: 'Variational Quantum Eigensolver',
    status: 'active',
    createdAt: '2024-10-05T13:30:00Z',
    lastActivityAt: '2024-12-16T14:45:00Z',
    messageCount: 15,
  },
  {
    id: 'session-6',
    groupId: 'group-3',
    title: 'Medical Image Segmentation',
    status: 'active',
    createdAt: '2024-11-01T10:00:00Z',
    lastActivityAt: '2024-12-18T07:00:00Z',
    messageCount: 27,
  },
];

// Mock Messages
export const mockMessages: Message[] = [
  {
    id: 'msg-1',
    sessionId: 'session-1',
    userId: 'user-1',
    content: 'Hey team! I\'ve been reading about the latest improvements in transformer architectures. Has anyone looked into the new sparse attention mechanisms?',
    timestamp: '2024-12-17T10:00:00Z',
    type: 'user',
  },
  {
    id: 'msg-2',
    sessionId: 'session-1',
    userId: 'user-2',
    content: 'Yes! I recently implemented a sparse attention variant. The computational savings are significant for longer sequences.',
    timestamp: '2024-12-17T10:15:00Z',
    type: 'user',
  },
  {
    id: 'msg-3',
    sessionId: 'session-1',
    userId: 'user-3',
    content: 'That sounds interesting. Could you share some benchmarks? I\'d love to see how it compares to vanilla attention.',
    timestamp: '2024-12-17T10:30:00Z',
    type: 'user',
  },
  {
    id: 'msg-4',
    sessionId: 'session-1',
    userId: 'user-2',
    content: 'Sure! I\'ll prepare a comparison table with training time, memory usage, and accuracy metrics. Give me a day.',
    timestamp: '2024-12-17T10:45:00Z',
    type: 'user',
  },
  {
    id: 'msg-5',
    sessionId: 'session-1',
    userId: 'ai-assistant',
    content: '**Task Extracted:** Bob will prepare a comparison table with training time, memory usage, and accuracy metrics for sparse attention vs vanilla attention.',
    timestamp: '2024-12-17T10:46:00Z',
    type: 'ai',
    metadata: { isTask: true },
  },
  {
    id: 'msg-6',
    sessionId: 'session-1',
    userId: 'user-4',
    content: 'This could be really useful for our vision transformer work. Let\'s schedule a follow-up discussion once we have the data.',
    timestamp: '2024-12-17T11:00:00Z',
    type: 'user',
  },
  {
    id: 'msg-7',
    sessionId: 'session-1',
    userId: 'ai-assistant',
    content: '**Session Summary:** The team is exploring sparse attention mechanisms in transformers. Bob has implemented a variant showing computational benefits and will provide benchmarks comparing it to vanilla attention. This research may benefit the vision transformer project.',
    timestamp: '2024-12-18T08:30:00Z',
    type: 'ai',
    metadata: { isSummary: true },
  },
  {
    id: 'msg-8',
    sessionId: 'session-4',
    userId: 'user-2',
    content: 'I\'ve been studying the surface code approach for quantum error correction. The threshold theorem is fascinating.',
    timestamp: '2024-12-18T09:00:00Z',
    type: 'user',
  },
  {
    id: 'msg-9',
    sessionId: 'session-4',
    userId: 'user-1',
    content: 'Have you looked at topological codes? They seem more resilient to certain types of errors.',
    timestamp: '2024-12-18T09:15:00Z',
    type: 'user',
  },
];

// Mock Papers
export const mockPapers: Paper[] = [
  {
    id: 'paper-1',
    title: 'Attention Is All You Need',
    authors: ['Vaswani, A.', 'Shazeer, N.', 'Parmar, N.', 'Uszkoreit, J.'],
    abstract: 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms.',
    tags: ['Transformers', 'NLP', 'Deep Learning', 'Attention'],
    url: 'https://arxiv.org/abs/1706.03762',
    publishedDate: '2017-06-12',
    citations: 95000,
  },
  {
    id: 'paper-2',
    title: 'BERT: Pre-training of Deep Bidirectional Transformers',
    authors: ['Devlin, J.', 'Chang, M.', 'Lee, K.', 'Toutanova, K.'],
    abstract: 'We introduce BERT, which stands for Bidirectional Encoder Representations from Transformers. BERT is designed to pre-train deep bidirectional representations by jointly conditioning on both left and right context.',
    tags: ['BERT', 'NLP', 'Pre-training', 'Transformers'],
    url: 'https://arxiv.org/abs/1810.04805',
    publishedDate: '2018-10-11',
    citations: 72000,
  },
  {
    id: 'paper-3',
    title: 'Quantum Error Correction for Beginners',
    authors: ['Devitt, S.', 'Munro, W.', 'Nemoto, K.'],
    abstract: 'Quantum error correction is an essential ingredient for universal quantum computing. This review provides an introduction to the theory of quantum error correction.',
    tags: ['Quantum Computing', 'Error Correction', 'Quantum Information'],
    url: 'https://arxiv.org/abs/0905.2794',
    publishedDate: '2009-05-18',
    citations: 3500,
  },
  {
    id: 'paper-4',
    title: 'Deep Residual Learning for Image Recognition',
    authors: ['He, K.', 'Zhang, X.', 'Ren, S.', 'Sun, J.'],
    abstract: 'We present a residual learning framework to ease the training of networks that are substantially deeper than those used previously. These residual networks are easier to optimize.',
    tags: ['Computer Vision', 'ResNet', 'Deep Learning', 'CNNs'],
    url: 'https://arxiv.org/abs/1512.03385',
    publishedDate: '2015-12-10',
    citations: 150000,
  },
  {
    id: 'paper-5',
    title: 'Generative Adversarial Networks',
    authors: ['Goodfellow, I.', 'Pouget-Abadie, J.', 'Mirza, M.', 'Xu, B.'],
    abstract: 'We propose a new framework for estimating generative models via an adversarial process. We simultaneously train two models: a generative model G and a discriminative model D.',
    tags: ['GANs', 'Generative Models', 'Deep Learning'],
    url: 'https://arxiv.org/abs/1406.2661',
    publishedDate: '2014-06-10',
    citations: 65000,
  },
  {
    id: 'paper-6',
    title: 'U-Net: Convolutional Networks for Biomedical Image Segmentation',
    authors: ['Ronneberger, O.', 'Fischer, P.', 'Brox, T.'],
    abstract: 'We present a network and training strategy that relies on data augmentation for efficient use of annotated samples in biomedical image segmentation.',
    tags: ['Medical Imaging', 'Segmentation', 'Computer Vision', 'Healthcare'],
    url: 'https://arxiv.org/abs/1505.04597',
    publishedDate: '2015-05-18',
    citations: 82000,
  },
];

// Mock Saved Papers
export const mockSavedPapers: SavedPaper[] = [
  {
    userId: 'user-1',
    paperId: 'paper-1',
    sessionId: 'session-1',
    savedAt: '2024-07-05T10:00:00Z',
    notes: 'Foundation paper for our transformer research',
  },
  {
    userId: 'user-1',
    paperId: 'paper-2',
    savedAt: '2024-07-10T14:00:00Z',
  },
  {
    userId: 'user-2',
    paperId: 'paper-3',
    sessionId: 'session-4',
    savedAt: '2024-09-05T11:00:00Z',
    notes: 'Good introduction to quantum error correction',
  },
  {
    userId: 'user-3',
    paperId: 'paper-6',
    sessionId: 'session-6',
    savedAt: '2024-11-02T09:30:00Z',
    notes: 'Essential for medical image segmentation project',
  },
];

// Mock Tasks
export const mockTasks: Task[] = [
  {
    id: 'task-1',
    sessionId: 'session-1',
    title: 'Prepare sparse attention benchmark comparison',
    description: 'Create comparison table with training time, memory usage, and accuracy metrics',
    status: 'in-progress',
    assignedTo: 'user-2',
    createdAt: '2024-12-17T10:46:00Z',
    extractedFromMessageId: 'msg-4',
  },
  {
    id: 'task-2',
    sessionId: 'session-1',
    title: 'Schedule follow-up discussion on vision transformers',
    status: 'pending',
    assignedTo: 'user-4',
    createdAt: '2024-12-17T11:00:00Z',
    extractedFromMessageId: 'msg-6',
  },
  {
    id: 'task-3',
    sessionId: 'session-6',
    title: 'Implement U-Net architecture for medical imaging',
    description: 'Based on the paper, implement custom U-Net variant',
    status: 'completed',
    assignedTo: 'user-3',
    createdAt: '2024-11-05T10:00:00Z',
  },
];

// Helper functions to get data
export function getGroupsByUserId(userId: string): Group[] {
  const userGroupIds = mockGroupMembers
    .filter(member => member.userId === userId)
    .map(member => member.groupId);
  
  return mockGroups.filter(group => userGroupIds.includes(group.id));
}

export function getSessionsByGroupId(groupId: string): Session[] {
  return mockSessions.filter(session => session.groupId === groupId);
}

export function getMessagesBySessionId(sessionId: string): Message[] {
  return mockMessages.filter(message => message.sessionId === sessionId);
}

export function getUserById(userId: string): User | undefined {
  return mockUsers.find(user => user.id === userId);
}

export function getGroupById(groupId: string): Group | undefined {
  return mockGroups.find(group => group.id === groupId);
}

export function getSessionById(sessionId: string): Session | undefined {
  return mockSessions.find(session => session.id === sessionId);
}

export function getPapersByUserId(userId: string): Paper[] {
  const savedPaperIds = mockSavedPapers
    .filter(saved => saved.userId === userId)
    .map(saved => saved.paperId);
  
  return mockPapers.filter(paper => savedPaperIds.includes(paper.id));
}

export function getTasksBySessionId(sessionId: string): Task[] {
  return mockTasks.filter(task => task.sessionId === sessionId);
}

// Current logged-in user (for Phase 1 testing)
export const CURRENT_USER_ID = 'user-1';
export const currentUser = getUserById(CURRENT_USER_ID)!;
