/**
 * Admin AI — Document vector store
 *
 * Embedding model : Voyage AI voyage-3-large (1024 dims)
 * Storage         : SQLite via Prisma (DocumentVector table)
 * Similarity      : cosine in TypeScript (no native extension needed)
 *
 * No npm package required — calls Voyage AI REST API directly.
 */

import { prisma } from '@/lib/prisma';
import { decryptApiKey } from '@/lib/ai-encryption';

const VOYAGE_API = 'https://api.voyageai.com/v1';
const VOYAGE_MODEL = 'voyage-3-large';
const CHUNK_SIZE = 1_500; // characters per chunk
const CHUNK_OVERLAP = 200; // overlap between consecutive chunks
const TOP_K = 5; // number of results to return

// ── Auth ──────────────────────────────────────────────────────────────────────

async function getVoyageKey(): Promise<string> {
  if (process.env.VOYAGE_API_KEY) return process.env.VOYAGE_API_KEY;

  const config = await prisma.adminAIConfig.findUnique({
    where: { id: 'singleton' },
    select: { voyageApiKey: true },
  });
  if (config?.voyageApiKey) return decryptApiKey(config.voyageApiKey);

  throw new Error(
    'No Voyage AI API key configured. Set the VOYAGE_API_KEY env var or add it in Admin AI Settings.',
  );
}

// ── Embedding ─────────────────────────────────────────────────────────────────

async function embedTexts(texts: string[]): Promise<number[][]> {
  const key = await getVoyageKey();

  const res = await fetch(`${VOYAGE_API}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: texts,
      model: VOYAGE_MODEL,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Voyage AI error: ${res.status} — ${err.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    data: Array<{ embedding: number[] }>;
  };
  return json.data.map((d) => d.embedding);
}

// ── Similarity ────────────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

// ── Text chunking ─────────────────────────────────────────────────────────────

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }

  return chunks.filter((c) => c.length > 0);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Index a document by filename and content.
 * Chunks the text, embeds via Voyage AI, and upserts into SQLite.
 * Re-indexing the same filename updates existing chunks and removes stale ones.
 */
export async function indexDocument(
  filename: string,
  content: string,
): Promise<string> {
  const chunks = chunkText(content);
  if (chunks.length === 0) return `Nothing to index in ${filename}`;

  // Embed in batches of 25 (Voyage AI limit per request)
  const BATCH = 25;
  const allEmbeddings: number[][] = [];
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const batchEmbeddings = await embedTexts(batch);
    allEmbeddings.push(...batchEmbeddings);
  }

  await Promise.all(
    chunks.map((chunk, i) =>
      prisma.documentVector.upsert({
        where: { filename_chunkIndex: { filename, chunkIndex: i } },
        create: {
          filename,
          chunkIndex: i,
          chunkText: chunk,
          embedding: JSON.stringify(allEmbeddings[i]),
        },
        update: {
          chunkText: chunk,
          embedding: JSON.stringify(allEmbeddings[i]),
        },
      }),
    ),
  );

  // Remove stale chunks if this doc was re-indexed and is now shorter
  await prisma.documentVector.deleteMany({
    where: { filename, chunkIndex: { gte: chunks.length } },
  });

  return `Indexed "${filename}": ${chunks.length} chunks stored.`;
}

/**
 * Semantic search across all indexed documents.
 * Returns the top-K most similar chunks with their source file and score.
 */
export async function searchDocuments(query: string): Promise<string> {
  const allChunks = await prisma.documentVector.findMany({
    select: {
      filename: true,
      chunkIndex: true,
      chunkText: true,
      embedding: true,
    },
  });

  if (allChunks.length === 0) {
    return 'No documents are indexed yet. Use index_documentation first.';
  }

  const indexed = allChunks.filter((c) => c.embedding !== null);
  if (indexed.length === 0) {
    return 'Documents found but none have embeddings yet.';
  }

  const [queryEmbedding] = await embedTexts([query]);

  const scored = indexed.map((c) => ({
    filename: c.filename,
    chunkIndex: c.chunkIndex,
    chunkText: c.chunkText,
    score: cosineSimilarity(
      queryEmbedding,
      JSON.parse(c.embedding!) as number[],
    ),
  }));

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, TOP_K);

  return JSON.stringify(
    top.map((r) => ({
      filename: r.filename,
      chunk: r.chunkIndex,
      score: Math.round(r.score * 1000) / 1000,
      text: r.chunkText,
    })),
    null,
    2,
  );
}

/**
 * List all indexed documents with chunk counts and index date.
 */
export async function listIndexedDocuments(): Promise<string> {
  const rows = await prisma.documentVector.groupBy({
    by: ['filename'],
    _count: { chunkIndex: true },
    _max: { createdAt: true },
  });

  if (rows.length === 0) return 'No documents indexed yet.';

  return JSON.stringify(
    rows.map((r) => ({
      filename: r.filename,
      chunks: r._count.chunkIndex,
      indexedAt: r._max.createdAt,
    })),
    null,
    2,
  );
}
