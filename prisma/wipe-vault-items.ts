import { PrismaClient } from '@prisma/client';

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (!raw.startsWith('--')) continue;
    const key = raw.slice(2);
    const next = argv[i + 1];

    if (!next || next.startsWith('--')) {
      args.set(key, true);
    } else {
      args.set(key, next);
      i++;
    }
  }

  const emailRaw = args.get('email');
  const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : '';
  const execute = args.get('execute') === true;
  const includeDeleted = args.get('include-deleted') === true;

  return { email, execute, includeDeleted };
}

async function main() {
  const { email, execute, includeDeleted } = parseArgs(process.argv.slice(2));

  if (!email) {
    console.error('Missing required arg: --email <user@example.com>');
    console.error('Usage: npx tsx prisma/wipe-vault-items.ts --email user@example.com [--execute] [--include-deleted]');
    process.exit(2);
  }

  const prisma = new PrismaClient();
  try {
    const zkUser = await prisma.zKUser.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (!zkUser) {
      throw new Error(`No ZKUser found for email: ${email}`);
    }

    const defaultVault = await prisma.zKVault.findFirst({
      where: { userId: zkUser.id, isDefault: true },
      select: { id: true },
    });

    if (!defaultVault) {
      throw new Error(`No default vault found for ZKUser ${zkUser.id} (${email})`);
    }

    const where = {
      vaultId: defaultVault.id,
      ...(includeDeleted ? {} : { deletedAt: null }),
    } as const;

    const count = await prisma.zKVaultItem.count({ where });

    console.log(`Vault wipe for ${email}`);
    console.log(`- ZKUser: ${zkUser.id}`);
    console.log(`- Default vault: ${defaultVault.id}`);
    console.log(`- Matching items: ${count}${includeDeleted ? ' (including deletedAt != null)' : ' (deletedAt == null only)'}`);

    if (!execute) {
      console.log('---');
      console.log('DRY RUN (no deletes performed).');
      console.log('To execute permanent deletes, re-run with: --execute');
      return;
    }

    if (count === 0) {
      console.log('Nothing to delete.');
      return;
    }

    console.log('---');
    console.log(`EXECUTE MODE: permanently deleting ${count} items in a transaction...`);

    const result = await prisma.$transaction(async (tx) => {
      return tx.zKVaultItem.deleteMany({ where });
    });

    console.log(`Deleted rows: ${result.count}`);

    const remaining = await prisma.zKVaultItem.count({ where });
    console.log(`Remaining matching items: ${remaining}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
