import Redis from 'ioredis';

/**
 * Redis client singleton.
 *
 * Returns `null` when REDIS_URL is not configured — callers must
 * handle the fallback (e.g. in-memory or DB).
 */

const globalForRedis = globalThis as unknown as {
  redis: Redis | null | undefined;
};

function createRedisClient(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  try {
    const client = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) return null; // stop retrying after 5 attempts
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    client.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
    });

    // Connect in the background — don't block startup
    client.connect().catch((err) => {
      console.warn('[Redis] Initial connect failed:', err.message);
    });

    return client;
  } catch (err) {
    console.error('[Redis] Failed to create client:', err);
    return null;
  }
}

export const redis: Redis | null =
  globalForRedis.redis !== undefined
    ? globalForRedis.redis
    : (globalForRedis.redis = createRedisClient());
