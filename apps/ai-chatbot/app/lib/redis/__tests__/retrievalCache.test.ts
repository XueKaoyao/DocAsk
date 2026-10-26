import { createHash } from 'node:crypto';

const mockScan = jest.fn();
const mockDel = jest.fn();
const mockGet = jest.fn();
const mockSet = jest.fn();
const mockZadd = jest.fn();
const mockZrem = jest.fn();
const mockZcard = jest.fn();
const mockZpopmin = jest.fn();
const mockEnsureRedis = jest.fn();

jest.mock('../client', () => ({
  ensureRedis: (...args: unknown[]) => mockEnsureRedis(...args),
  isRetrievalCacheEnabled: () => true,
  getRetrievalCacheTtlSec: () => 300,
  getRetrievalCacheMaxEntries: () => 2,
}));

import {
  RETRIEVAL_CACHE_PREFIX,
  RETRIEVAL_LRU_ZSET_KEY,
  buildRetrievalCacheKey,
  enforceRetrievalCacheLru,
  getCachedRetrieval,
  invalidateRetrievalCache,
  setCachedRetrieval,
  stableCacheFingerprint,
} from '../retrievalCache';

describe('retrievalCache key', () => {
  const base = {
    query: '  忘记密码  ',
    mode: 'hybrid' as const,
    k: 5,
    docId: 'doc1',
  };

  it('normalizes query whitespace in fingerprint', () => {
    const a = stableCacheFingerprint({ ...base, query: '忘记密码' });
    const b = stableCacheFingerprint({ ...base, query: '  忘记密码  ' });
    const c = stableCacheFingerprint({ ...base, query: '忘记密码' });
    expect(a).toBe(b);
    expect(JSON.parse(a).query).toBe('忘记密码');
    expect(c).toBe(a);
  });

  it('buildRetrievalCacheKey is stable for same params', () => {
    const k1 = buildRetrievalCacheKey(base);
    const k2 = buildRetrievalCacheKey({ ...base, query: '  忘记密码   ' });
    expect(k1).toBe(k2);
    expect(k1.startsWith(`${RETRIEVAL_CACHE_PREFIX}hybrid:`)).toBe(true);
  });

  it('changes key when mode or k changes', () => {
    const hybrid = buildRetrievalCacheKey(base);
    const vector = buildRetrievalCacheKey({ ...base, mode: 'vector' });
    const k10 = buildRetrievalCacheKey({ ...base, k: 10 });
    expect(hybrid).not.toBe(vector);
    expect(hybrid).not.toBe(k10);
  });

  it('includes hybrid options in fingerprint', () => {
    const a = buildRetrievalCacheKey({
      ...base,
      candidateK: 20,
      kRrf: 60,
      weights: { vector: 1, bm25: 2 },
    });
    const b = buildRetrievalCacheKey({
      ...base,
      candidateK: 20,
      kRrf: 60,
      weights: { vector: 1, bm25: 1 },
    });
    expect(a).not.toBe(b);

    const fp = stableCacheFingerprint({
      ...base,
      candidateK: 20,
      kRrf: 60,
      weights: { bm25: 2, vector: 1 },
    });
    const hash = createHash('sha256').update(fp).digest('hex').slice(0, 32);
    expect(a).toBe(`${RETRIEVAL_CACHE_PREFIX}hybrid:${hash}`);
  });
});

describe('invalidateRetrievalCache', () => {
  beforeEach(() => {
    mockScan.mockReset();
    mockDel.mockReset();
    mockEnsureRedis.mockReset();
  });

  it('returns 0 when redis unavailable', async () => {
    mockEnsureRedis.mockResolvedValue(null);
    await expect(invalidateRetrievalCache()).resolves.toBe(0);
  });

  it('scans prefix, skips LRU zset in batch, then deletes LRU index', async () => {
    mockEnsureRedis.mockResolvedValue({
      scan: mockScan,
      del: mockDel,
    });
    mockScan
      .mockResolvedValueOnce([
        '1',
        [
          `${RETRIEVAL_CACHE_PREFIX}hybrid:aaa`,
          RETRIEVAL_LRU_ZSET_KEY,
          `${RETRIEVAL_CACHE_PREFIX}vector:bbb`,
        ],
      ])
      .mockResolvedValueOnce(['0', []]);
    mockDel.mockResolvedValue(2);

    const n = await invalidateRetrievalCache();
    expect(mockDel).toHaveBeenNthCalledWith(
      1,
      `${RETRIEVAL_CACHE_PREFIX}hybrid:aaa`,
      `${RETRIEVAL_CACHE_PREFIX}vector:bbb`,
    );
    expect(mockDel).toHaveBeenNthCalledWith(2, RETRIEVAL_LRU_ZSET_KEY);
    expect(n).toBe(2);
  });
});

describe('LRU', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockReset();
    mockZadd.mockReset();
    mockZrem.mockReset();
    mockZcard.mockReset();
    mockZpopmin.mockReset();
    mockDel.mockReset();
    mockEnsureRedis.mockReset();
  });

  it('touches LRU on cache hit', async () => {
    const key = buildRetrievalCacheKey({
      query: 'q',
      mode: 'hybrid',
      k: 3,
    });
    mockEnsureRedis.mockResolvedValue({
      get: mockGet,
      zadd: mockZadd,
      zrem: mockZrem,
      del: mockDel,
    });
    mockGet.mockResolvedValue(
      JSON.stringify({
        query: 'q',
        mode: 'hybrid',
        count: 0,
        results: [],
      }),
    );

    const hit = await getCachedRetrieval({ query: 'q', mode: 'hybrid', k: 3 });
    expect(hit?.key).toBe(key);
    expect(mockZadd).toHaveBeenCalledWith(
      RETRIEVAL_LRU_ZSET_KEY,
      expect.any(Number),
      key,
    );
  });

  it('evicts oldest key when over capacity', async () => {
    const redis = {
      zcard: mockZcard,
      zpopmin: mockZpopmin,
      del: mockDel,
    };
    mockZcard.mockResolvedValueOnce(3).mockResolvedValueOnce(2);
    mockZpopmin.mockResolvedValueOnce(['retrieval:v1:hybrid:old']);

    const n = await enforceRetrievalCacheLru(redis as never, 2);
    expect(n).toBe(1);
    expect(mockZpopmin).toHaveBeenCalledWith(RETRIEVAL_LRU_ZSET_KEY, 1);
    expect(mockDel).toHaveBeenCalledWith('retrieval:v1:hybrid:old');
  });

  it('setCachedRetrieval writes value, touches LRU, then enforces cap', async () => {
    mockEnsureRedis.mockResolvedValue({
      set: mockSet,
      zadd: mockZadd,
      zcard: mockZcard,
      zpopmin: mockZpopmin,
      del: mockDel,
    });
    mockZcard.mockResolvedValue(1);

    const ok = await setCachedRetrieval(
      { query: 'q', mode: 'bm25', k: 2 },
      { query: 'q', mode: 'bm25', count: 0, results: [] },
    );
    expect(ok).toBe(true);
    expect(mockSet).toHaveBeenCalled();
    expect(mockZadd).toHaveBeenCalled();
    expect(mockZcard).toHaveBeenCalled();
  });
});
