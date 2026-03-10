import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { and, count, eq } from 'drizzle-orm';
import { db } from './db/index.js';
import * as schema from './db/schema.js';
import logger from './utils/logger.js';

const seedLogger = logger.child({ context: 'seed' });

async function ensureUser(user: {
  name: string;
  email: string;
  password: string;
  avatar: string;
}) {
  const [createdOrUpdated] = await db
    .insert(schema.users)
    .values(user)
    .onConflictDoUpdate({
      target: schema.users.email,
      set: {
        name: user.name,
        password: user.password,
        avatar: user.avatar,
        updatedAt: new Date(),
      },
    })
    .returning({ id: schema.users.id });

  return createdOrUpdated;
}

async function ensureGroup(group: {
  name: string;
  description: string;
  ownerId: string;
  avatar: string;
}) {
  const [existing] = await db
    .select({ id: schema.groups.id })
    .from(schema.groups)
    .where(and(eq(schema.groups.name, group.name), eq(schema.groups.ownerId, group.ownerId)))
    .limit(1);

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(schema.groups)
    .values(group)
    .returning({ id: schema.groups.id });

  return created;
}

async function ensureSession(session: {
  groupId: string;
  title: string;
  status: 'active' | 'archived';
}) {
  const [existing] = await db
    .select({ id: schema.sessions.id })
    .from(schema.sessions)
    .where(and(eq(schema.sessions.groupId, session.groupId), eq(schema.sessions.title, session.title)))
    .limit(1);

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(schema.sessions)
    .values(session)
    .returning({ id: schema.sessions.id });

  return created;
}

async function ensureSampleMessages(sessionId: string, messages: Array<{
  userId: string;
  content: string;
  type: 'user' | 'ai';
}>) {
  const [messageCount] = await db
    .select({ value: count() })
    .from(schema.messages)
    .where(eq(schema.messages.sessionId, sessionId));

  if ((messageCount?.value ?? 0) > 0) {
    return;
  }

  await db.insert(schema.messages).values(
    messages.map((message) => ({
      sessionId,
      userId: message.userId,
      content: message.content,
      type: message.type,
    }))
  );
}

async function ensurePaper(paper: {
  title: string;
  authors: string[];
  abstract: string;
  url: string;
  publishedDate: string;
  citations: number;
}) {
  const [existing] = await db
    .select({ id: schema.papers.id })
    .from(schema.papers)
    .where(eq(schema.papers.url, paper.url))
    .limit(1);

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(schema.papers)
    .values(paper)
    .returning({ id: schema.papers.id });

  return created;
}

async function seed() {
  seedLogger.info('Seeding database...');

  try {
    const hashedPassword = await bcrypt.hash('password123', 12);

    // Create users
    const alice = await ensureUser({
      name: 'Alice Johnson',
      email: 'alice@example.com',
      password: hashedPassword,
      avatar: 'https://ui-avatars.com/api/?name=Alice'
    });

    const bob = await ensureUser({
      name: 'Bob Smith',
      email: 'bob@example.com',
      password: hashedPassword,
      avatar: 'https://ui-avatars.com/api/?name=Bob'
    });

    const carol = await ensureUser({
      name: 'Carol Williams',
      email: 'carol@example.com',
      password: hashedPassword,
      avatar: 'https://ui-avatars.com/api/?name=Carol'
    });

    const david = await ensureUser({
      name: 'David Chen',
      email: 'david@example.com',
      password: hashedPassword,
      avatar: 'https://ui-avatars.com/api/?name=David'
    });

    seedLogger.info('Ensured users');

    // Create groups
    const aiLab = await ensureGroup({
      name: 'AI Research Lab',
      description: 'Exploring cutting-edge AI and machine learning research',
      ownerId: alice.id,
      avatar: 'https://ui-avatars.com/api/?name=AI'
    });

    const quantumGroup = await ensureGroup({
      name: 'Quantum Computing Group',
      description: 'Advancing quantum algorithms and error correction',
      ownerId: bob.id,
      avatar: 'https://ui-avatars.com/api/?name=Quantum'
    });

    const healthGroup = await ensureGroup({
      name: 'Healthcare Innovation',
      description: 'AI applications in medicine and healthcare',
      ownerId: carol.id,
      avatar: 'https://ui-avatars.com/api/?name=Health'
    });

    const visionLab = await ensureGroup({
      name: 'Computer Vision Lab',
      description: 'Image processing and visual recognition research',
      ownerId: alice.id,
      avatar: 'https://ui-avatars.com/api/?name=Vision'
    });

    seedLogger.info('Ensured groups');

    // Add members to groups
    await db.insert(schema.groupMembers).values([
      { groupId: aiLab.id, userId: alice.id, role: 'owner' },
      { groupId: aiLab.id, userId: bob.id, role: 'member' },
      { groupId: aiLab.id, userId: carol.id, role: 'member' },
      { groupId: aiLab.id, userId: david.id, role: 'member' },
      { groupId: quantumGroup.id, userId: bob.id, role: 'owner' },
      { groupId: quantumGroup.id, userId: alice.id, role: 'member' },
      { groupId: healthGroup.id, userId: carol.id, role: 'owner' },
      { groupId: visionLab.id, userId: alice.id, role: 'owner' },
    ]).onConflictDoNothing();

    seedLogger.info('Ensured group members');

    // Create sessions
    const session1 = await ensureSession({
      groupId: aiLab.id,
      title: 'Transformer Architecture Discussion',
      status: 'active'
    });

    const session2 = await ensureSession({
      groupId: aiLab.id,
      title: 'RLHF Implementation Strategy',
      status: 'active'
    });

    const session3 = await ensureSession({
      groupId: aiLab.id,
      title: 'Paper Review: Attention Is All You Need',
      status: 'archived'
    });

    const session4 = await ensureSession({
      groupId: quantumGroup.id,
      title: 'Quantum Error Correction Codes',
      status: 'active'
    });

    seedLogger.info('Ensured sessions');

    // Create messages
    await ensureSampleMessages(session1.id, [
      {
        userId: alice.id,
        content: "Hey team! I've been reading about the latest improvements in transformer architectures. Has anyone looked into the new sparse attention mechanisms?",
        type: 'user'
      },
      {
        userId: bob.id,
        content: 'Yes! I recently implemented a sparse attention variant. The computational savings are significant for longer sequences.',
        type: 'user'
      },
      {
        userId: carol.id,
        content: "That sounds interesting. Could you share some benchmarks? I'd love to see how it compares to vanilla attention.",
        type: 'user'
      },
      {
        userId: bob.id,
        content: "Sure! I'll prepare a comparison table with training time, memory usage, and accuracy metrics. Give me a day.",
        type: 'user'
      }
    ]);

    seedLogger.info('Ensured sample messages');

    // Create papers
    for (const paper of [
      {
        title: 'Attention Is All You Need',
        authors: ["Vaswani, A.", "Shazeer, N.", "Parmar, N.", "Uszkoreit, J."],
        abstract: 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks.',
        url: 'https://arxiv.org/abs/1706.03762',
        publishedDate: '2017-06-12',
        citations: 95000
      },
      {
        title: 'BERT: Pre-training of Deep Bidirectional Transformers',
        authors: ["Devlin, J.", "Chang, M.", "Lee, K.", "Toutanova, K."],
        abstract: 'We introduce BERT for pre-training deep bidirectional representations.',
        url: 'https://arxiv.org/abs/1810.04805',
        publishedDate: '2018-10-11',
        citations: 72000
      },
      {
        title: 'Quantum Error Correction for Beginners',
        authors: ["Devitt, S.", "Munro, W.", "Nemoto, K."],
        abstract: 'Quantum error correction is essential for quantum computing.',
        url: 'https://arxiv.org/abs/0905.2794',
        publishedDate: '2009-05-18',
        citations: 3500
      },
      {
        title: 'Deep Residual Learning for Image Recognition',
        authors: ["He, K.", "Zhang, X.", "Ren, S.", "Sun, J."],
        abstract: 'A residual learning framework for deep neural networks.',
        url: 'https://arxiv.org/abs/1512.03385',
        publishedDate: '2015-12-10',
        citations: 150000
      },
      {
        title: 'Generative Adversarial Networks',
        authors: ["Goodfellow, I.", "Pouget-Abadie, J.", "Mirza, M.", "Xu, B."],
        abstract: 'A framework for estimating generative models via adversarial training.',
        url: 'https://arxiv.org/abs/1406.2661',
        publishedDate: '2014-06-10',
        citations: 65000
      },
      {
        title: 'U-Net: Convolutional Networks for Biomedical Image Segmentation',
        authors: ["Ronneberger, O.", "Fischer, P.", "Brox, T."],
        abstract: 'A network for biomedical image segmentation.',
        url: 'https://arxiv.org/abs/1505.04597',
        publishedDate: '2015-05-18',
        citations: 82000
      }
    ]) {
      await ensurePaper(paper);
    }

    seedLogger.info('Ensured papers');
    seedLogger.info('Seeding complete!');
    seedLogger.info({ email: 'alice@example.com', password: 'password123' }, 'Test credentials');

  } catch (error) {
    seedLogger.error({ err: error }, 'Seeding failed');
    process.exit(1);
  }
}

seed();
