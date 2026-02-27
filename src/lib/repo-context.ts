/**
 * Fetches and caches repository context from GitHub for AI-powered features.
 * Includes file tree, CLAUDE.md excerpt, and Prisma schema summary.
 * Fetches from BOTH repos: macOS app (deepterm) and web app (deepterm-web).
 * Cache refreshes every 30 minutes.
 */

const REPOS = [
  { owner: 'deblasioluca', name: 'deepterm', label: 'macOS App', branch: 'main' },
  { owner: 'deblasioluca', name: 'deepterm-web', label: 'Web App', branch: 'main' },
];

let repoContextCache: { text: string; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 30 * 60 * 1000;

async function fetchRepoContext(
  repo: typeof REPOS[number],
  headers: Record<string, string>
): Promise<string[]> {
  const parts: string[] = [];
  const base = `https://api.github.com/repos/${repo.owner}/${repo.name}`;

  try {
    // 1. Fetch repo tree
    const treeRes = await fetch(
      `${base}/git/trees/${repo.branch}?recursive=1`,
      { headers }
    );
    if (treeRes.ok) {
      const treeData = await treeRes.json();
      const paths = (treeData.tree || [])
        .filter((t: { type: string; path: string }) =>
          t.type === 'blob' &&
          !t.path.includes('node_modules') &&
          !t.path.includes('.next') &&
          !t.path.startsWith('.git/')
        )
        .map((t: { path: string }) => t.path) as string[];

      const relevantPaths = paths.filter((p: string) =>
        p.startsWith('src/') ||
        p.startsWith('prisma/') ||
        p.startsWith('DeepTerm/') ||
        p.startsWith('Sources/') ||
        p === 'package.json' ||
        p === 'Package.swift' ||
        p === 'Podfile' ||
        p === 'CLAUDE.md' ||
        p === 'tailwind.config.ts' ||
        p === 'next.config.js' ||
        p === 'next.config.mjs'
      );

      parts.push(`### ${repo.label} File Tree (${repo.name})\n\`\`\`\n` + relevantPaths.join('\n') + '\n```');
    }

    // 2. Fetch CLAUDE.md if present
    const claudeMdRes = await fetch(
      `${base}/contents/CLAUDE.md`,
      { headers: { ...headers, Accept: 'application/vnd.github.raw+json' } }
    );
    if (claudeMdRes.ok) {
      const claudeMd = await claudeMdRes.text();
      const truncated = claudeMd.slice(0, 4000);
      const cutAt = truncated.lastIndexOf('\n##');
      parts.push(`### ${repo.label} Guidelines (CLAUDE.md)\n` + (cutAt > 0 ? truncated.slice(0, cutAt) : truncated));
    }

    // 3. Fetch Prisma schema if present (web app)
    const schemaRes = await fetch(
      `${base}/contents/prisma/schema.prisma`,
      { headers: { ...headers, Accept: 'application/vnd.github.raw+json' } }
    );
    if (schemaRes.ok) {
      const schema = await schemaRes.text();
      const modelLines = schema.split('\n').filter(
        (line: string) => line.startsWith('model ') || line.match(/^\s+\w+\s+\w+/)
      );
      if (modelLines.length > 0) {
        parts.push(`### ${repo.label} Database Models\n\`\`\`prisma\n` + modelLines.slice(0, 120).join('\n') + '\n```');
      }
    }
  } catch (e) {
    console.error(`[RepoContext] Failed to fetch ${repo.name}:`, e);
  }

  return parts;
}

export async function getRepoContext(): Promise<string> {
  if (repoContextCache && Date.now() - repoContextCache.fetchedAt < CACHE_TTL_MS) {
    return repoContextCache.text;
  }

  const ghToken = process.env.GITHUB_TOKEN;
  if (!ghToken) return '';

  const headers = { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github+json' };

  // Fetch both repos in parallel
  const [appParts, webParts] = await Promise.all(
    REPOS.map(repo => fetchRepoContext(repo, headers))
  );

  const allParts: string[] = [];
  if (appParts.length > 0) {
    allParts.push('## macOS App Repository (deepterm)\n' + appParts.join('\n\n'));
  }
  if (webParts.length > 0) {
    allParts.push('## Web App Repository (deepterm-web)\n' + webParts.join('\n\n'));
  }

  const text = allParts.join('\n\n---\n\n');
  repoContextCache = { text, fetchedAt: Date.now() };
  return text;
}
