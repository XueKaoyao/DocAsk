import { createHash } from 'node:crypto';
import type Redis from 'ioredis';
import type { RetrievalMode, SearchHit } from '@/app/types/RetrievalType';
import {
  ensureRedis,
  getRetrievalCacheMaxEntries,
  getRetrievalCacheTtlSec,
  isRetrievalCacheEnabled,
} from './client';

export const RETRIEVAL_CACHE_PREFIX = 'retrieval:v1:';

/** ZSET：member=缓存 key，score=最近访问时间戳（ms）。分最低 = 最久未用 = LRU 淘汰对象 */
export const RETRIEVAL_LRU_ZSET_KEY = `${RETRIEVAL_CACHE_PREFIX}__lru__`;

export type RetrievalCacheParams = {
  query: string;
  mode: RetrievalMode;
  k: number;
  docId?: string;
  candidateK?: number;
  kRrf?: number;
  weights?: { vector?: number; bm25?: number };
};

/** 写入 Redis 的业务载荷（不含 timings） */
export type CachedRetrievalPayload = {
  query: string;
  mode: RetrievalMode;
  count: number;
  results: SearchHit[];
};

function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ');
}

/** 稳定序列化：固定字段顺序，避免 JSON key 顺序导致 key 抖动 */
export function stableCacheFingerprint(params: RetrievalCacheParams): string {
  const weights = params.weights
    ? {
        vector: params.weights.vector ?? null,
        bm25: params.weights.bm25 ?? null,
      }
    : null;

  return JSON.stringify({
    candidateK: params.candidateK ?? null,
    docId: params.docId ?? null,
    k: params.k,
    kRrf: params.kRrf ?? null,
    mode: params.mode,
    query: normalizeQuery(params.query),
    weights,
  });
}

export function buildRetrievalCacheKey(params: RetrievalCacheParams): string {
  const hash = createHash('sha256')
    .update(stableCacheFingerprint(params))
    .digest('hex')
    .slice(0, 32);
  return `${RETRIEVAL_CACHE_PREFIX}${params.mode}:${hash}`;
}

function parseCachedPayload(raw: string): CachedRetrievalPayload | null {
  try {
    const data = JSON.parse(raw) as Partial<CachedRetrievalPayload>;
    if (
      typeof data.query !== 'string' ||
      (data.mode !== 'vector' &&
        data.mode !== 'bm25' &&
        data.mode !== 'hybrid') ||
      typeof data.count !== 'number' ||
      !Array.isArray(data.results)
    ) {
      return null;
    }
    return {
      query: data.query,
      mode: data.mode,
      count: data.count,
      results: data.results as SearchHit[],
    };
  } catch {
    return null;
  }
}

/** 标记 key 为最近使用（更新 ZSET score） */
async function touchLru(redis: Redis, key: string): Promise<void> {
  await redis.zadd(RETRIEVAL_LRU_ZSET_KEY, Date.now(), key);
}

/**
 * 超出容量时按 LRU 淘汰：ZSET 分最低（最久未访问）先删。
 * @returns 淘汰的 key 数量
 */
export async function enforceRetrievalCacheLru(
  redis: Redis,
  maxEntries = getRetrievalCacheMaxEntries(),
): Promise<number> {
  let evicted = 0;
  // 防御：容量异常时不进入死循环
  const hardStop = maxEntries + 10_000;

  while (evicted < hardStop) {
    const size = await redis.zcard(RETRIEVAL_LRU_ZSET_KEY);
    if (size <= maxEntries) break;

    // ZPOPMIN：弹出 score 最小的 member（最久未用）
    const popped = await redis.zpopmin(RETRIEVAL_LRU_ZSET_KEY, 1);
    const victim = popped[0];
    if (!victim) break;

    await redis.del(victim);
    evicted += 1;
  }

  if (evicted > 0) {
    console.info('[redis] LRU evicted retrieval cache keys:', evicted);
  }
  return evicted;
}

/**
 * 读缓存。开关关闭 / Redis 不可用 / 解析失败 → null（调用方走实时检索）。
 * 命中时更新 LRU 访问时间。
 */
export async function getCachedRetrieval(
  params: RetrievalCacheParams,
): Promise<{ key: string; payload: CachedRetrievalPayload } | null> {
  if (!isRetrievalCacheEnabled()) return null;

  const key = buildRetrievalCacheKey(params);
  const redis = await ensureRedis();
  if (!redis) return null;

  try {
    const raw = await redis.get(key);
    if (!raw) {
      // 数据已过期但 LRU 索引可能残留
      await redis.zrem(RETRIEVAL_LRU_ZSET_KEY, key);
      return null;
    }
    const payload = parseCachedPayload(raw);
    if (!payload) {
      console.warn('[redis] invalid retrieval cache payload, ignore key:', key);
      await redis.del(key);
      await redis.zrem(RETRIEVAL_LRU_ZSET_KEY, key);
      return null;
    }
    await touchLru(redis, key);
    return { key, payload };
  } catch (err) {
    console.warn('[redis] getCachedRetrieval failed:', err);
    return null;
  }
}

/**
 * 写缓存。失败只打日志，不影响主流程。
 * 写入后纳入 LRU，并在超出 RETRIEVAL_CACHE_MAX_ENTRIES 时淘汰最久未用项。
 * @returns 是否写入成功
 */
export async function setCachedRetrieval(
  params: RetrievalCacheParams,
  payload: CachedRetrievalPayload,
  ttlSec = getRetrievalCacheTtlSec(),
): Promise<boolean> {
  if (!isRetrievalCacheEnabled()) return false;

  const key = buildRetrievalCacheKey(params);
  const redis = await ensureRedis();
  if (!redis) return false;

  try {
    const body: CachedRetrievalPayload = {
      query: payload.query,
      mode: payload.mode,
      count: payload.count,
      results: payload.results,
    };
    await redis.set(key, JSON.stringify(body), 'EX', ttlSec);
    await touchLru(redis, key);
    await enforceRetrievalCacheLru(redis);
    return true;
  } catch (err) {
    console.warn('[redis] setCachedRetrieval failed:', err);
    return false;
  }
}

/**
 * 语料变更后失效检索缓存。
 * 学习项目采用前缀全清（SCAN + DEL），并清空 LRU 索引。
 * @returns 删除的 key 数量；Redis 不可用时返回 0
 */
export async function invalidateRetrievalCache(): Promise<number> {
  const redis = await ensureRedis();
  if (!redis) return 0;

  const pattern = `${RETRIEVAL_CACHE_PREFIX}*`;
  let deleted = 0;

  try {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = next;
      const dataKeys = keys.filter((k) => k !== RETRIEVAL_LRU_ZSET_KEY);
      if (dataKeys.length > 0) {
        deleted += await redis.del(...dataKeys);
      }
    } while (cursor !== '0');

    await redis.del(RETRIEVAL_LRU_ZSET_KEY);

    if (deleted > 0) {
      console.info('[redis] invalidated retrieval cache keys:', deleted);
    }
    return deleted;
  } catch (err) {
    console.warn('[redis] invalidateRetrievalCache failed:', err);
    return 0;
  }
}
