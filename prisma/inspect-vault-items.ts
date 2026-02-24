import { PrismaClient } from '@prisma/client';

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  if (!email) {
    console.error('Usage: npx tsx prisma/inspect-vault-items.ts <email>');
    process.exit(2);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.zKUser.findUnique({ where: { email }, select: { id: true } });
    if (!user) throw new Error(`No ZKUser for ${email}`);

    const vault = await prisma.zKVault.findFirst({ where: { userId: user.id, isDefault: true }, select: { id: true } });
    if (!vault) throw new Error(`No default vault for ${email}`);

    const items = await prisma.zKVaultItem.findMany({
      where: { vaultId: vault.id, deletedAt: null },
      select: { id: true, revisionDate: true, createdAt: true, encryptedData: true },
      orderBy: { revisionDate: 'desc' },
    });

    console.log(JSON.stringify({ email, userId: user.id, vaultId: vault.id, itemCount: items.length }, null, 2));

    const byEncryptedData = new Map<string, number>();

    for (const it of items) {
      byEncryptedData.set(it.encryptedData, (byEncryptedData.get(it.encryptedData) || 0) + 1);
    }

    const top = (m: Map<string, number>, n: number) =>
      Array.from(m.entries()).map(([k, v]) => ({ key: k, count: v })).sort((a, b) => b.count - a.count).slice(0, n);

    console.log('Unique encryptedData:', byEncryptedData.size);
    console.log('Top encryptedData duplicates:', top(byEncryptedData, 10).filter(e => e.count > 1));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
