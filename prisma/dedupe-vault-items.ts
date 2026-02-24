import { PrismaClient } from '@prisma/client';

type VaultItem = {
  id: string;
  encryptedData: string;
  revisionDate: Date;
  createdAt: Date;
};

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
  const verbose = args.get('verbose') === true;

  return { email, execute, verbose };
}

function newestFirst(a: VaultItem, b: VaultItem) {
  const aDate = a.revisionDate ?? a.createdAt;
  const bDate = b.revisionDate ?? b.createdAt;
  return bDate.getTime() - aDate.getTime();
}

async function main() {
  const { email, execute, verbose } = parseArgs(process.argv.slice(2));

  if (!email) {
    console.error('Missing required arg: --email <user@example.com>');
    console.error('Usage: npx tsx prisma/dedupe-vault-items.ts --email user@example.com [--execute] [--verbose]');
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

    const items = await prisma.zKVaultItem.findMany({
      where: { vaultId: defaultVault.id, deletedAt: null },
      select: {
        id: true,
        encryptedData: true,
        revisionDate: true,
        createdAt: true,
      },
    });

    console.log(`Vault dedupe for ${email}`);
    console.log(`- ZKUser: ${zkUser.id}`);
    console.log(`- Default vault: ${defaultVault.id}`);
    console.log(`- Items (not deleted): ${items.length}`);

    const groups = new Map<string, VaultItem[]>();
    for (const item of items) {
      const key = item.encryptedData;
      const list = groups.get(key);
      if (list) list.push(item);
      else groups.set(key, [item]);
    }

    const uniqueCount = groups.size;
    const duplicatesCount = items.length - uniqueCount;

    console.log(`- Unique encryptedData groups: ${uniqueCount}`);
    console.log(`- Duplicates to remove (expected): ${duplicatesCount}`);

    let plannedDeletes: { keep: VaultItem; remove: VaultItem[] }[] = [];

    for (const [, group] of Array.from(groups)) {
      if (group.length <= 1) continue;
      const sorted = [...group].sort(newestFirst);
      const [keep, ...remove] = sorted;
      plannedDeletes.push({ keep, remove });
    }

    const totalDeleteCount = plannedDeletes.reduce((sum, g) => sum + g.remove.length, 0);

    if (!execute) {
      console.log('---');
      console.log('DRY RUN (no deletes performed).');
      console.log(`Would delete ${totalDeleteCount} items and keep ${uniqueCount}.`);

      for (const g of plannedDeletes) {
        const keepDate = (g.keep.revisionDate ?? g.keep.createdAt).toISOString();
        console.log(`Keep ${g.keep.id} (${keepDate}), remove ${g.remove.length}: ${g.remove.map(i => i.id).join(', ')}`);
        if (verbose) {
          for (const r of g.remove) {
            const rDate = (r.revisionDate ?? r.createdAt).toISOString();
            console.log(`  - remove ${r.id} (${rDate})`);
          }
        }
      }

      console.log('---');
      console.log('To execute deletes, re-run with: --execute');
      return;
    }

    if (totalDeleteCount === 0) {
      console.log('No duplicates found. Nothing to delete.');
      return;
    }

    console.log('---');
    console.log(`EXECUTE MODE: deleting ${totalDeleteCount} duplicate items in a transaction...`);

    const deletedIds: string[] = [];

    await prisma.$transaction(async (tx) => {
      for (const g of plannedDeletes) {
        for (const r of g.remove) {
          await tx.zKVaultItem.delete({ where: { id: r.id } });
          deletedIds.push(r.id);
        }
      }
    });

    console.log(`Deleted ${deletedIds.length} items.`);
    if (verbose) {
      console.log(`Deleted IDs: ${deletedIds.join(', ')}`);
    }

    const remaining = await prisma.zKVaultItem.count({
      where: { vaultId: defaultVault.id, deletedAt: null },
    });

    console.log(`Remaining items in vault: ${remaining}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
