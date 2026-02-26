/**
 * Fetches and caches repository context from GitHub for AI-powered features.
 * Includes file tree, CLAUDE.md excerpt, and Prisma schema summary.
 * Cache refreshes every 30 minutes.
 */

let repoContextCache: { text: string; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 30 * 60 * 1000;

export async function getRepoContext(): Promise<string> {
  if (repoContextCache && Date.now() - repoContextCache.fetchedAt < CACHE_TTL_MS) {
    return repoContextCache.text;
  }

  const ghToken = process.env.GITHUB_TOKEN;
  if (!ghToken) return '';

  const headers = { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github+json' };
  const parts: string[] = [];

  try {
    // 1. Fetch repo tree (recursive, default branch)
    const treeRes = await fetch(
      'https://api.github.com/repos/deblasioluca/deepterm/git/trees/main?recursive=1',
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

      // Keep only src/ structure and key root files for conciseness
      const relevantPaths = paths.filter((p: string) =>
        p.startsWith('src/') ||
        p.startsWith('prisma/') ||
        p === 'package.json' ||
        p === 'CLAUDE.md' ||
        p === 'tailwind.config.ts' ||
        p === 'next.config.js'
      );

      parts.push('## Repository File Tree\n```\n' + relevantPaths.join('\n') + '\n```');
    }

    // 2. Fetch CLAUDE.md (project guidelines — truncated to key sections)
    const claudeMdRes = await fetch(
      'https://api.github.com/repos/deblasioluca/deepterm/contents/CLAUDE.md',
      { headers: { ...headers, Accept: 'application/vnd.github.raw+json' } }
    );
    if (claudeMdRes.ok) {
      const claudeMd = await claudeMdRes.text();
      // Include first ~4000 chars (product context, tech stack, architecture)
      const truncated = claudeMd.slice(0, 4000);
      const cutAt = truncated.lastIndexOf('\n##');
      parts.push('## Project Guidelines (CLAUDE.md excerpt)\n' + (cutAt > 0 ? truncated.slice(0, cutAt) : truncated));
    }

    // 3. Fetch Prisma schema (database models)
    const schemaRes = await fetch(
      'https://api.github.com/repos/deblasioluca/deepterm/contents/prisma/schema.prisma',
      { headers: { ...headers, Accept: 'application/vnd.github.raw+json' } }
    );
    if (schemaRes.ok) {
      const schema = await schemaRes.text();
      // Extract just model definitions for context
      const modelLines = schema.split('\n').filter(
        (line: string) => line.startsWith('model ') || line.match(/^\s+\w+\s+\w+/)
      );
      if (modelLines.length > 0) {
        parts.push('## Database Models (Prisma schema summary)\n```prisma\n' + modelLines.slice(0, 100).join('\n') + '\n```');
      }
    }
  } catch (e) {
    console.error('[RepoContext] Failed to fetch repo context:', e);
  }

  const text = parts.join('\n\n');
  repoContextCache = { text, fetchedAt: Date.now() };
  return text;
}
