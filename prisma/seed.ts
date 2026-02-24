import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create admin users
  const adminPasswordHash = await bcrypt.hash('admin123', 10);
  
  const superAdmin = await prisma.adminUser.upsert({
    where: { email: 'admin@deepterm.net' },
    update: {},
    create: {
      email: 'admin@deepterm.net',
      passwordHash: adminPasswordHash,
      name: 'Super Admin',
      role: 'superadmin',
      isActive: true,
    },
  });

  console.log('✅ Created admin user:', superAdmin.email, '(password: admin123)');

  // Create team
  const team = await prisma.team.create({
    data: {
      name: 'DeepTerm Engineering',
      plan: 'team',
      ssoEnabled: false,
    },
  });

  console.log('✅ Created team:', team.name);

  // Create users
  const passwordHash = await bcrypt.hash('password123', 10);

  const alice = await prisma.user.create({
    data: {
      name: 'Alice Chen',
      email: 'alice@deepterm.net',
      passwordHash,
      role: 'owner',
      teamId: team.id,
    },
  });

  const bob = await prisma.user.create({
    data: {
      name: 'Bob Martinez',
      email: 'bob@deepterm.net',
      passwordHash,
      role: 'admin',
      teamId: team.id,
    },
  });

  const carol = await prisma.user.create({
    data: {
      name: 'Carol Park',
      email: 'carol@deepterm.net',
      passwordHash,
      role: 'member',
      teamId: team.id,
    },
  });

  console.log('✅ Created users:', alice.name, bob.name, carol.name);

  // Legacy Vault + Credential seed data removed — all vault data is in ZKVault + ZKVaultItem (E2E encrypted)

  // Create ideas
  const ideas = [
    {
      title: 'AI auto-configuration from infrastructure-as-code',
      description: 'Automatically detect and configure SSH connections from Terraform, Ansible, or Pulumi files.',
      category: 'feature',
      status: 'consideration',
      authorId: alice.id,
    },
    {
      title: 'Terraform integration',
      description: 'Native integration with Terraform state to auto-discover infrastructure.',
      category: 'feature',
      status: 'consideration',
      authorId: bob.id,
    },
    {
      title: 'Kubernetes pod exec support',
      description: 'Direct kubectl exec integration for Kubernetes clusters.',
      category: 'feature',
      status: 'consideration',
      authorId: carol.id,
    },
    {
      title: 'Snippet packages and sharing',
      description: 'Share and import snippet packages with the community.',
      category: 'feature',
      status: 'beta',
      authorId: alice.id,
    },
    {
      title: 'ARM64 native Linux build',
      description: 'Native build for ARM64 Linux (Raspberry Pi, AWS Graviton).',
      category: 'feature',
      status: 'beta',
      authorId: bob.id,
    },
    {
      title: 'SFTP browser improvements',
      description: 'Drag-and-drop file uploads, progress indicators, and batch operations.',
      category: 'feature',
      status: 'launched',
      authorId: alice.id,
    },
    {
      title: 'Real-time terminal collaboration',
      description: 'Share terminal sessions with team members in real-time.',
      category: 'feature',
      status: 'launched',
      authorId: carol.id,
    },
  ];

  for (const idea of ideas) {
    await prisma.idea.create({ data: idea });
  }
  console.log('✅ Created ideas');

  // Create votes
  const allIdeas = await prisma.idea.findMany();
  const allUsers = [alice, bob, carol];

  // Add random votes
  const voteCounts: Record<string, number> = {
    'AI auto-configuration from infrastructure-as-code': 42,
    'Terraform integration': 37,
    'Kubernetes pod exec support': 28,
    'Snippet packages and sharing': 89,
    'ARM64 native Linux build': 64,
    'SFTP browser improvements': 0, // Already launched
    'Real-time terminal collaboration': 0, // Already launched
  };

  for (const idea of allIdeas) {
    // Each team member votes on non-launched ideas
    if (idea.status !== 'launched') {
      for (const user of allUsers) {
        await prisma.vote.create({
          data: {
            userId: user.id,
            ideaId: idea.id,
          },
        });
      }
    }
  }
  console.log('✅ Created votes');

  // Create sessions
  await prisma.session.createMany({
    data: [
      {
        userId: alice.id,
        device: 'MacBook Pro 16" (M3 Max)',
        ipAddress: '192.168.1.100',
      },
      {
        userId: alice.id,
        device: 'iPhone 15 Pro',
        ipAddress: '192.168.1.101',
      },
      {
        userId: bob.id,
        device: 'MacBook Air M2',
        ipAddress: '192.168.1.102',
      },
    ],
  });
  console.log('✅ Created sessions');

  console.log('🎉 Database seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
