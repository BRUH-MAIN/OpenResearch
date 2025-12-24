import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { neon } from '@neondatabase/serverless';

async function seed() {
  console.log('🌱 Seeding database...');

  try {
    const sql = neon(process.env.DATABASE_URL!);
    const hashedPassword = await bcrypt.hash('password123', 12);
    
    // Create users using raw SQL via Neon client directly
    const aliceResult = await sql`
      INSERT INTO users (name, email, password, avatar, interests)
      VALUES (${'Alice Johnson'}, ${'alice@example.com'}, ${hashedPassword}, ${'https://ui-avatars.com/api/?name=Alice'}, NULL)
      RETURNING id
    `;
    const aliceId = aliceResult[0].id;
    
    const bobResult = await sql`
      INSERT INTO users (name, email, password, avatar, interests)
      VALUES (${'Bob Smith'}, ${'bob@example.com'}, ${hashedPassword}, ${'https://ui-avatars.com/api/?name=Bob'}, NULL)
      RETURNING id
    `;
    const bobId = bobResult[0].id;
    
    const carolResult = await sql`
      INSERT INTO users (name, email, password, avatar, interests)
      VALUES (${'Carol Williams'}, ${'carol@example.com'}, ${hashedPassword}, ${'https://ui-avatars.com/api/?name=Carol'}, NULL)
      RETURNING id
    `;
    const carolId = carolResult[0].id;
    
    const davidResult = await sql`
      INSERT INTO users (name, email, password, avatar, interests)
      VALUES (${'David Chen'}, ${'david@example.com'}, ${hashedPassword}, ${'https://ui-avatars.com/api/?name=David'}, NULL)
      RETURNING id
    `;
    const davidId = davidResult[0].id;

    console.log('✅ Created users');

    // Create groups using raw SQL
    const aiLabResult = await sql`
      INSERT INTO groups (name, description, owner_id, avatar)
      VALUES (${'AI Research Lab'}, ${'Exploring cutting-edge AI and machine learning research'}, ${aliceId}, ${'https://ui-avatars.com/api/?name=AI'})
      RETURNING id
    `;
    const aiLabId = aiLabResult[0].id;
    
    const quantumGroupResult = await sql`
      INSERT INTO groups (name, description, owner_id, avatar)
      VALUES (${'Quantum Computing Group'}, ${'Advancing quantum algorithms and error correction'}, ${bobId}, ${'https://ui-avatars.com/api/?name=Quantum'})
      RETURNING id
    `;
    const quantumGroupId = quantumGroupResult[0].id;
    
    const healthGroupResult = await sql`
      INSERT INTO groups (name, description, owner_id, avatar)
      VALUES (${'Healthcare Innovation'}, ${'AI applications in medicine and healthcare'}, ${carolId}, ${'https://ui-avatars.com/api/?name=Health'})
      RETURNING id
    `;
    const healthGroupId = healthGroupResult[0].id;
    
    const visionLabResult = await sql`
      INSERT INTO groups (name, description, owner_id, avatar)
      VALUES (${'Computer Vision Lab'}, ${'Image processing and visual recognition research'}, ${aliceId}, ${'https://ui-avatars.com/api/?name=Vision'})
      RETURNING id
    `;
    const visionLabId = visionLabResult[0].id;

    console.log('✅ Created groups');

    // Add members to groups using raw SQL
    const memberInserts = [
      [aiLabId, aliceId, 'owner'],
      [aiLabId, bobId, 'member'],
      [aiLabId, carolId, 'member'],
      [aiLabId, davidId, 'member'],
      [quantumGroupId, bobId, 'owner'],
      [quantumGroupId, aliceId, 'member'],
      [healthGroupId, carolId, 'owner'],
      [visionLabId, aliceId, 'owner'],
    ];
    
    for (const [groupId, userId, role] of memberInserts) {
      await sql`INSERT INTO group_members (group_id, user_id, role) VALUES (${groupId}, ${userId}, ${role})`;
    }

    console.log('✅ Added group members');

    // Create sessions using raw SQL
    const session1Result = await sql`
      INSERT INTO sessions (group_id, title, status)
      VALUES (${aiLabId}, ${'Transformer Architecture Discussion'}, ${'active'})
      RETURNING id
    `;
    const session1Id = session1Result[0].id;
    
    const session2Result = await sql`
      INSERT INTO sessions (group_id, title, status)
      VALUES (${aiLabId}, ${'RLHF Implementation Strategy'}, ${'active'})
      RETURNING id
    `;
    const session2Id = session2Result[0].id;
    
    const session3Result = await sql`
      INSERT INTO sessions (group_id, title, status)
      VALUES (${aiLabId}, ${'Paper Review: Attention Is All You Need'}, ${'archived'})
      RETURNING id
    `;
    const session3Id = session3Result[0].id;
    
    const session4Result = await sql`
      INSERT INTO sessions (group_id, title, status)
      VALUES (${quantumGroupId}, ${'Quantum Error Correction Codes'}, ${'active'})
      RETURNING id
    `;
    const session4Id = session4Result[0].id;

    console.log('✅ Created sessions');

    // Create messages using raw SQL
    const messageInserts = [
      [session1Id, aliceId, "Hey team! I've been reading about the latest improvements in transformer architectures. Has anyone looked into the new sparse attention mechanisms?", 'user'],
      [session1Id, bobId, 'Yes! I recently implemented a sparse attention variant. The computational savings are significant for longer sequences.', 'user'],
      [session1Id, carolId, "That sounds interesting. Could you share some benchmarks? I'd love to see how it compares to vanilla attention.", 'user'],
      [session1Id, bobId, "Sure! I'll prepare a comparison table with training time, memory usage, and accuracy metrics. Give me a day.", 'user'],
      [session1Id, null, '**Task Extracted:** Bob will prepare a comparison table with training time, memory usage, and accuracy metrics for sparse attention vs vanilla attention.', 'ai'],
    ];
    
    for (const [sessionId, userId, content, type] of messageInserts) {
      await sql`INSERT INTO messages (session_id, user_id, content, type) VALUES (${sessionId}, ${userId}, ${content}, ${type})`;
    }
    console.log('✅ Created messages');

    // Create tasks using raw SQL
    await sql`
      INSERT INTO tasks (session_id, title, description, status, assigned_to)
      VALUES (${session1Id}, ${'Prepare sparse attention benchmark comparison'}, ${'Create comparison table with training time, memory usage, and accuracy metrics'}, ${'in-progress'}, ${bobId})
    `;
    
    await sql`
      INSERT INTO tasks (session_id, title, status, assigned_to)
      VALUES (${session1Id}, ${'Schedule follow-up discussion on vision transformers'}, ${'pending'}, ${davidId})
    `;

    console.log('✅ Created tasks');

    // Create papers using raw SQL (without jsonb)
    await sql`
      INSERT INTO papers (title, authors, abstract, url, published_date, citations)
      VALUES (${'Attention Is All You Need'}, ${'["Vaswani, A.","Shazeer, N.","Parmar, N.","Uszkoreit, J."]'}::jsonb, ${'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks.'}, ${'https://arxiv.org/abs/1706.03762'}, ${'2017-06-12'}, ${95000})
    `;
    
    await sql`
      INSERT INTO papers (title, authors, abstract, url, published_date, citations)
      VALUES (${'BERT: Pre-training of Deep Bidirectional Transformers'}, ${'["Devlin, J.","Chang, M.","Lee, K.","Toutanova, K."]'}::jsonb, ${'We introduce BERT for pre-training deep bidirectional representations.'}, ${'https://arxiv.org/abs/1810.04805'}, ${'2018-10-11'}, ${72000})
    `;
    
    await sql`
      INSERT INTO papers (title, authors, abstract, url, published_date, citations)
      VALUES (${'Quantum Error Correction for Beginners'}, ${'["Devitt, S.","Munro, W.","Nemoto, K."]'}::jsonb, ${'Quantum error correction is essential for quantum computing.'}, ${'https://arxiv.org/abs/0905.2794'}, ${'2009-05-18'}, ${3500})
    `;
    
    await sql`
      INSERT INTO papers (title, authors, abstract, url, published_date, citations)
      VALUES (${'Deep Residual Learning for Image Recognition'}, ${'["He, K.","Zhang, X.","Ren, S.","Sun, J."]'}::jsonb, ${'A residual learning framework for deep neural networks.'}, ${'https://arxiv.org/abs/1512.03385'}, ${'2015-12-10'}, ${150000})
    `;
    
    await sql`
      INSERT INTO papers (title, authors, abstract, url, published_date, citations)
      VALUES (${'Generative Adversarial Networks'}, ${'["Goodfellow, I.","Pouget-Abadie, J.","Mirza, M.","Xu, B."]'}::jsonb, ${'A framework for estimating generative models via adversarial training.'}, ${'https://arxiv.org/abs/1406.2661'}, ${'2014-06-10'}, ${65000})
    `;
    
    await sql`
      INSERT INTO papers (title, authors, abstract, url, published_date, citations)
      VALUES (${'U-Net: Convolutional Networks for Biomedical Image Segmentation'}, ${'["Ronneberger, O.","Fischer, P.","Brox, T."]'}::jsonb, ${'A network for biomedical image segmentation.'}, ${'https://arxiv.org/abs/1505.04597'}, ${'2015-05-18'}, ${82000})
    `;

    console.log('✅ Created papers');
    console.log('🎉 Seeding complete!');
    console.log('\n📧 Test credentials:');
    console.log('   Email: alice@example.com');
    console.log('   Password: password123');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seed();
