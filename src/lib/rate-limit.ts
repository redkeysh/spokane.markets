import type { Redis } from "ioredis";

const ACTION_CONFIG: Record<string, { windowMs: number; maxRequests: number }> = {
  subscribe: { windowMs: 60 * 1000, maxRequests: 5 },
  newsletter: { windowMs: 60 * 1000, maxRequests: 5 },
  register: { windowMs: 60 * 1000, maxRequests: 5 },
  reviews: { windowMs: 60 * 60 * 1000, maxRequests: 10 },
  uploads: { windowMs: 60 * 60 * 1000, maxRequests: 20 },
  vendorSurvey: { windowMs: 60 * 1000, maxRequests: 5 },
  reports: { windowMs: 60 * 60 * 1000, maxRequests: 5 },
  contact: { windowMs: 60 * 60 * 1000, maxRequests: 5 },
  vendorIntents: { windowMs: 60 * 60 * 1000, maxRequests: 30 },
  changePassword: { windowMs: 60 * 60 * 1000, maxRequests: 5 },
  application: { windowMs: 60 * 1000, maxRequests: 5 },
  mcp: { windowMs: 60 * 1000, maxRequests: 120 },
};

function getConfig(action: string) {
  return ACTION_CONFIG[action] ?? { windowMs: 60 * 1000, maxRequests: 5 };
}

// --- Redis client (lazy singleton) ---
let redis: Redis | null = null;

async function getRedis(): Promise<Redis | null> {
  if (redis) return redis;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    const { default: IORedis } = await import("ioredis");
    redis = new IORedis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
    }) as Redis;
    redis.connect().catch(() => {
      console.warn("[rate-limit] Redis connection failed, falling back to in-memory");
      redis = null;
    });
    return redis;
  } catch {
    return null;
  }
}

// --- In-memory fallback ---
const memoryStore = new Map<string, { count: number; resetAt: number }>();

function checkMemory(
  key: string,
  windowMs: number,
  maxRequests: number,
): { ok: boolean; remaining: number; retryAfter?: number } {
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || now > entry.resetAt) {
    memoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: maxRequests - 1 };
  }

  entry.count++;
  const remaining = Math.max(0, maxRequests - entry.count);
  const ok = entry.count <= maxRequests;
  const retryAfter = ok ? undefined : Math.ceil((entry.resetAt - now) / 1000);
  return { ok, remaining, retryAfter };
}

// --- Redis-backed check ---
async function checkRedis(
  client: Redis,
  key: string,
  windowMs: number,
  maxRequests: number,
): Promise<{ ok: boolean; remaining: number; retryAfter?: number }> {
  try {
    const windowSec = Math.ceil(windowMs / 1000);
    const redisKey = `rl:${key}`;

    const count = await client.incr(redisKey);
    if (count === 1) {
      await client.expire(redisKey, windowSec);
    }

    const remaining = Math.max(0, maxRequests - count);
    const ok = count <= maxRequests;

    if (!ok) {
      const ttl = await client.ttl(redisKey);
      return { ok: false, remaining: 0, retryAfter: ttl > 0 ? ttl : windowSec };
    }

    return { ok, remaining };
  } catch {
    return checkMemory(key, windowMs, maxRequests);
  }
}

// --- Public API ---
export async function checkRateLimit(
  identifier: string,
  action: string,
): Promise<{ ok: boolean; remaining: number; retryAfter?: number }> {
  const { windowMs, maxRequests } = getConfig(action);
  const key = `${action}:${identifier}`;

  const client = await getRedis();
  if (client) {
    return checkRedis(client, key, windowMs, maxRequests);
  }

  return checkMemory(key, windowMs, maxRequests);
}

// Cleanup expired in-memory entries periodically
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryStore.entries()) {
      if (now > entry.resetAt) memoryStore.delete(key);
    }
  }, 60_000);
}
