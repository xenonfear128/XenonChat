import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await argon2.hash('Password123!', { type: argon2.argon2id });

  const alice = await prisma.user.upsert({
    where: { email: 'alice@xenonchat.local' },
    update: {
      passwordHash,
      nickname: 'Alice',
      bio: 'Hello from Alice',
      status: 'normal',
      deletedAt: null,
    },
    create: {
      email: 'alice@xenonchat.local',
      username: 'alice',
      nickname: 'Alice',
      passwordHash,
      bio: 'Hello from Alice',
      privacy: { create: {} },
    },
  });

  const bob = await prisma.user.upsert({
    where: { email: 'bob@xenonchat.local' },
    update: {
      passwordHash,
      nickname: 'Bob',
      bio: 'Hello from Bob',
      language: 'en_US',
      status: 'normal',
      deletedAt: null,
    },
    create: {
      email: 'bob@xenonchat.local',
      username: 'bob',
      nickname: 'Bob',
      passwordHash,
      bio: 'Hello from Bob',
      language: 'en_US',
      privacy: { create: {} },
    },
  });

  const carol = await prisma.user.upsert({
    where: { email: 'carol@xenonchat.local' },
    update: {
      passwordHash,
      nickname: 'Carol',
      status: 'normal',
      deletedAt: null,
    },
    create: {
      email: 'carol@xenonchat.local',
      username: 'carol',
      nickname: 'Carol',
      passwordHash,
      privacy: { create: {} },
    },
  });

  for (const user of [alice, bob, carol]) {
    await prisma.userPrivacy.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });
  }

  // Mutual friendships alice-bob, alice-carol
  for (const [a, b] of [
    [alice.id, bob.id],
    [alice.id, carol.id],
    [bob.id, carol.id],
  ] as const) {
    await prisma.contact.upsert({
      where: { ownerUserId_contactUserId: { ownerUserId: a, contactUserId: b } },
      create: { ownerUserId: a, contactUserId: b },
      update: {},
    });
    await prisma.contact.upsert({
      where: { ownerUserId_contactUserId: { ownerUserId: b, contactUserId: a } },
      create: { ownerUserId: b, contactUserId: a },
      update: {},
    });
  }

  const group = await prisma.group.upsert({
    where: { publicId: 'xenon_lounge' },
    update: {
      name: 'Xenon Lounge',
      description: 'Welcome to XenonChat demo group',
      ownerUserId: alice.id,
      maxMembers: 500,
      status: 'normal',
      dissolvedAt: null,
    },
    create: {
      publicId: 'xenon_lounge',
      name: 'Xenon Lounge',
      description: 'Welcome to XenonChat demo group',
      ownerUserId: alice.id,
      maxMembers: 500,
      memberCount: 3,
      members: {
        create: [
          { userId: alice.id, role: 'owner' },
          { userId: bob.id, role: 'admin' },
          { userId: carol.id, role: 'member' },
        ],
      },
    },
  });

  for (const [userId, role] of [
    [alice.id, 'owner'],
    [bob.id, 'admin'],
    [carol.id, 'member'],
  ] as const) {
    await prisma.groupMember.upsert({
      where: { groupId_userId: { groupId: group.id, userId } },
      create: { groupId: group.id, userId, role },
      update: { role, leftAt: null, mutedUntil: null },
    });
  }
  await prisma.group.update({
    where: { id: group.id },
    data: { memberCount: 3 },
  });

  let conversation = await prisma.conversation.findUnique({ where: { groupId: group.id } });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        type: 'group',
        groupId: group.id,
      },
    });
  }
  for (const userId of [alice.id, bob.id, carol.id]) {
    await prisma.conversationMember.upsert({
      where: {
        conversationId_userId: { conversationId: conversation.id, userId },
      },
      create: { conversationId: conversation.id, userId },
      update: { leftAt: null },
    });
  }

  await prisma.groupAnnouncement.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      groupId: group.id,
      authorId: alice.id,
      title: 'Welcome',
      body: 'Please be kind. Slow mode may be enabled during busy hours.',
      pinned: true,
      pinnedOrder: 1,
    },
  });

  // eslint-disable-next-line no-console
  console.log('Seeded users: alice / bob / carol (Password123!)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
