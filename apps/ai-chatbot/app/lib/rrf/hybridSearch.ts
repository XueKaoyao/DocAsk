import { searchBm25 } from '@/app/lib/bm25';
import { searchSnippets } from '@/app/lib/chunks';
import type { SearchHit } from '@/app/types/RetrievalType';
import { fuseRrf } from './fuse';

export type HybridSearchOptions = {
  /** 每路召回深度；默认 max(k * 4, 20) */
  candidateK?: number;
  /** RRF 平滑常数，默认 60 */
  kRrf?: number;
  weights?: { vector?: number; bm25?: number };
};

export type HybridSearchTimings = {
  /** 两路并行的墙钟时间 */
  searchMs: number;
  vectorMs: number;
  bm25Ms: number;
  fuseMs: number;
  openTableMs: number;
  mapMs: number;
};

export type HybridSearchResult = {
  hits: SearchHit[];
  timings: HybridSearchTimings;
};

function defaultCandidateK(k: number): number {
  return Math.max(k * 4, 20);
}

/**
 * 并行向量 + BM25 召回，再用 RRF 融合为最终 top-k。
 * 任一路失败则降级为另一路；两路都失败则抛错。
 */
export async function hybridSearch(
  query: string,
  k = 5,
  docId?: string,
  options: HybridSearchOptions = {},
): Promise<HybridSearchResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error('query is required');
  }
  if (!Number.isFinite(k) || k < 1) {
    throw new Error('k must be a positive number');
  }

  const candidateK = options.candidateK ?? defaultCandidateK(k);
  if (!Number.isFinite(candidateK) || candidateK < 1) {
    throw new Error('candidateK must be a positive number');
  }

  const tParallel0 = performance.now();

  const [vecSettled, bm25Settled] = await Promise.all([
    (async () => {
      const t0 = performance.now();
      try {
        const result = await searchSnippets(trimmed, candidateK, docId);
        return {
          ok: true as const,
          hits: result.hits,
          openTableMs: result.timings.openTableMs,
          mapMs: result.timings.mapMs,
          ms: performance.now() - t0,
        };
      } catch (error) {
        return {
          ok: false as const,
          error,
          openTableMs: 0,
          mapMs: 0,
          ms: performance.now() - t0,
        };
      }
    })(),
    (async () => {
      const t0 = performance.now();
      try {
        const result = await searchBm25(trimmed, candidateK, docId);
        return {
          ok: true as const,
          hits: result.hits,
          ms: performance.now() - t0,
        };
      } catch (error) {
        return {
          ok: false as const,
          error,
          ms: performance.now() - t0,
        };
      }
    })(),
  ]);

  const searchMs = performance.now() - tParallel0;
  const vectorMs = vecSettled.ms;
  const bm25Ms = bm25Settled.ms;
  const openTableMs = vecSettled.ok ? vecSettled.openTableMs : 0;
  const vectorMapMs = vecSettled.ok ? vecSettled.mapMs : 0;

  if (!vecSettled.ok && !bm25Settled.ok) {
    const vecErr = vecSettled.error;
    const message =
      vecErr instanceof Error ? vecErr.message : 'hybrid search failed';
    throw vecErr instanceof Error ? vecErr : new Error(message);
  }

  const vectorHits = vecSettled.ok ? vecSettled.hits : [];
  const bm25Hits = bm25Settled.ok ? bm25Settled.hits : [];

  if (!vecSettled.ok) {
    console.warn(
      '[hybrid] vector search failed, degrade to bm25:',
      vecSettled.error,
    );
  }
  if (!bm25Settled.ok) {
    console.warn(
      '[hybrid] bm25 search failed, degrade to vector:',
      bm25Settled.error,
    );
  }

  const tFuse0 = performance.now();
  const fused = fuseRrf(
    [
      {
        name: 'vector',
        ids: vectorHits.map((h) => h.id),
        weight: options.weights?.vector,
      },
      {
        name: 'bm25',
        ids: bm25Hits.map((h) => h.id),
        weight: options.weights?.bm25,
      },
    ],
    { kRrf: options.kRrf, limit: k },
  );

  const byId = new Map<string, SearchHit>();
  for (const hit of vectorHits) byId.set(hit.id, hit);
  for (const hit of bm25Hits) {
    if (!byId.has(hit.id)) byId.set(hit.id, hit);
  }

  const hits: SearchHit[] = [];
  for (const { id, score } of fused) {
    const base = byId.get(id);
    if (!base) continue;
    hits.push({ ...base, score });
  }
  const fuseMs = performance.now() - tFuse0;

  return {
    hits,
    timings: {
      searchMs,
      vectorMs,
      bm25Ms,
      fuseMs,
      openTableMs,
      mapMs: vectorMapMs + fuseMs,
    },
  };
}
