import Redis from 'ioredis';

type GlobalRedis = typeof globalThis & {
  __redisClient?: Redis | null;
  __redisDisabled?: boolean;
};

function g(): GlobalRedis {
  return globalThis as GlobalRedis;
}

function redisUrl(): string | undefined {
  const url = process.env.REDIS_URL?.trim();
  return url || undefined;
}

/** 检索缓存总开关；未设置时默认开启（有 REDIS_URL 才真正连） */
export function isRetrievalCacheEnabled(): boolean {
  const flag = process.env.RETRIEVAL_CACHE_ENABLED;
  if (flag === undefined || flag === '') return true;
  return flag === 'true' || flag === '1';
}

export function getRetrievalCacheTtlSec(): number {
  const raw = process.env.RETRIEVAL_CACHE_TTL_SEC;
  const n = raw === undefined || raw === '' ? 300 : Number(raw);
  if (!Number.isFinite(n) || n < 1) return 300;
  return Math.floor(n);
}

/** 检索缓存最大条目数（LRU 容量）；默认 100 */
export function getRetrievalCacheMaxEntries(): number {
  const raw = process.env.RETRIEVAL_CACHE_MAX_ENTRIES;
  const n = raw === undefined || raw === '' ? 100 : Number(raw);
  if (!Number.isFinite(n) || n < 1) return 100;
  return Math.floor(n);
}

/**
 * 进程内 Redis 单例（挂 globalThis，避免 Next dev 热更新多实例）。
 * 未配置 REDIS_URL、显式禁用或连接失败时返回 null（调用方应降级）。
 */
export function getRedis(): Redis | null {
  const state = g();
  if (state.__redisDisabled) return null;
  if (state.__redisClient) return state.__redisClient;

  const url = redisUrl();
  if (!url) {
    state.__redisDisabled = true;
    return null;
  }

  try {
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    client.on('error', (err) => {
      console.warn('[redis] client error:', err.message);
    });

    state.__redisClient = client;
    return client;
  } catch (err) {
    console.warn('[redis] failed to create client:', err);
    state.__redisDisabled = true;
    state.__redisClient = null;
    return null;
  }
}

/** 探测可用性；失败则本次进程内不再强连（可重启进程恢复） */
export async function ensureRedis(): Promise<Redis | null> {
  const client = getRedis();
  if (!client) return null;

  try {
    if (client.status === 'wait') {
      await client.connect();
    }
    const pong = await client.ping();
    if (pong !== 'PONG') {
      console.warn('[redis] unexpected ping reply:', pong);
      return null;
    }
    return client;
  } catch (err) {
    console.warn('[redis] ping failed, degrade without cache:', err);
    return null;
  }
}
