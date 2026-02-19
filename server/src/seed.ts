import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { db } from './db/index.js';
import * as schema from './db/schema.js';
import logger from './utils/logger.js';

const seedLogger = logger.child({ context: 'seed' });

async function seed() {
  seedLogger.info('Seeding database...');

  try {
    const hashedPassword = await bcrypt.hash('password123', 12);

    // Create users
    const [alice] = await db.insert(schema.users).values({
      name: 'Alice Johnson',
      email: 'alice@example.com',
      password: hashedPassword,
      avatar: 'https://ui-avatars.com/api/?name=Alice'
    }).returning({ id: schema.users.id });

    const [bob] = await db.insert(schema.users).values({
      name: 'Bob Smith',
      email: 'bob@example.com',
      password: hashedPassword,
      avatar: 'https://ui-avatars.com/api/?name=Bob'
    }).returning({ id: schema.users.id });

    const [carol] = await db.insert(schema.users).values({
      name: 'Carol Williams',
      email: 'carol@example.com',
      password: hashedPassword,
      avatar: 'https://ui-avatars.com/api/?name=Carol'
    }).returning({ id: schema.users.id });

    const [david] = await db.insert(schema.users).values({
      name: 'David Chen',
      email: 'david@example.com',
      password: hashedPassword,
      avatar: 'https://ui-avatars.com/api/?name=David'
    }).returning({ id: schema.users.id });

    seedLogger.info('Created users');

    // Create groups
    const [aiLab] = await db.insert(schema.groups).values({
      name: 'AI Research Lab',
      description: 'Exploring cutting-edge AI and machine learning research',
      ownerId: alice.id,
      avatar: 'https://ui-avatars.com/api/?name=AI'
    }).returning({ id: schema.groups.id });

    const [quantumGroup] = await db.insert(schema.groups).values({
      name: 'Quantum Computing Group',
      description: 'Advancing quantum algorithms and error correction',
      ownerId: bob.id,
      avatar: 'https://ui-avatars.com/api/?name=Quantum'
    }).returning({ id: schema.groups.id });

    const [healthGroup] = await db.insert(schema.groups).values({
      name: 'Healthcare Innovation',
      description: 'AI applications in medicine and healthcare',
      ownerId: carol.id,
      avatar: 'https://ui-avatars.com/api/?name=Health'
    }).returning({ id: schema.groups.id });

    const [visionLab] = await db.insert(schema.groups).values({
      name: 'Computer Vision Lab',
      description: 'Image processing and visual recognition research',
      ownerId: alice.id,
      avatar: 'https://ui-avatars.com/api/?name=Vision'
    }).returning({ id: schema.groups.id });

    seedLogger.info('Created groups');

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
    ]);

    seedLogger.info('Added group members');

    // Create sessions
    const [session1] = await db.insert(schema.sessions).values({
      groupId: aiLab.id,
      title: 'Transformer Architecture Discussion',
      status: 'active'
    }).returning({ id: schema.sessions.id });

    const [session2] = await db.insert(schema.sessions).values({
      groupId: aiLab.id,
      title: 'RLHF Implementation Strategy',
      status: 'active'
    }).returning({ id: schema.sessions.id });

    const [session3] = await db.insert(schema.sessions).values({
      groupId: aiLab.id,
      title: 'Paper Review: Attention Is All You Need',
      status: 'archived'
    }).returning({ id: schema.sessions.id });

    const [session4] = await db.insert(schema.sessions).values({
      groupId: quantumGroup.id,
      title: 'Quantum Error Correction Codes',
      status: 'active'
    }).returning({ id: schema.sessions.id });

    seedLogger.info('Created sessions');

    // Create messages
    await db.insert(schema.messages).values([
      {
        sessionId: session1.id,
        userId: alice.id,
        content: "Hey team! I've been reading about the latest improvements in transformer architectures. Has anyone looked into the new sparse attention mechanisms?",
        type: 'user'
      },
      {
        sessionId: session1.id,
        userId: bob.id,
        content: 'Yes! I recently implemented a sparse attention variant. The computational savings are significant for longer sequences.',
        type: 'user'
      },
      {
        sessionId: session1.id,
        userId: carol.id,
        content: "That sounds interesting. Could you share some benchmarks? I'd love to see how it compares to vanilla attention.",
        type: 'user'
      },
      {
        sessionId: session1.id,
        userId: bob.id,
        content: "Sure! I'll prepare a comparison table with training time, memory usage, and accuracy metrics. Give me a day.",
        type: 'user'
      }
    ]);

    seedLogger.info('Created messages');

    // Create papers
    await db.insert(schema.papers).values([
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
    ]);

    seedLogger.info('Created papers');
    seedLogger.info('Seeding complete!');
    seedLogger.info({ email: 'alice@example.com', password: 'password123' }, 'Test credentials');

  } catch (error) {
    seedLogger.error({ err: error }, 'Seeding failed');
    process.exit(1);
  }
}

seed();
