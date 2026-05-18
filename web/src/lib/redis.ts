import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis: Redis };

export const redis =
  globalForRedis.redis ||
  new Redis(process.env.REDIS_URL || "redis://localhost:63790");

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

export async function cacheGet(namespace: string, key: string): Promise<string | null> {
  const hash = Buffer.from(key).toString("base64url").slice(0, 24);
  return redis.get(`scout:${namespace}:${hash}`);
}

export async function cacheSet(namespace: string, key: string, value: string, ttlSeconds = 86400): Promise<void> {
  const hash = Buffer.from(key).toString("base64url").slice(0, 24);
  await redis.setex(`scout:${namespace}:${hash}`, ttlSeconds, value);
}
