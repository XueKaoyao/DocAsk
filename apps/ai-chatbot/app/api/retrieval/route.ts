import { NextResponse } from 'next/server';
import { searchBm25 } from '@/app/lib/bm25';
import { searchSnippets } from '@/app/lib/chunks';
import {
  getCachedRetrieval,
  isRetrievalCacheEnabled,
  setCachedRetrieval,
  type RetrievalCacheParams,
} from '@/app/lib/redis';
import { rerankSearchHits } from '@/app/lib/rerank';
import { hybridSearch } from '@/app/lib/rrf';
import type {
  RetrievalCacheStatus,
  RetrievalMode,
  RetrievalTimings,
  SearchHit,
  SearchResponse,
} from '@/app/types/RetrievalType';

function roundMs(ms: number): number {
  return Math.round(ms * 100) / 100;
}

const RETRIEVAL_MODES: RetrievalMode[] = ['vector', 'bm25', 'hybrid'];

function parseMode(value: unknown): RetrievalMode | null {
  if (value === undefined || value === null || value === '') return 'hybrid';
  if (typeof value !== 'string') return null;
  return RETRIEVAL_MODES.includes(value as RetrievalMode)
    ? (value as RetrievalMode)
    : null;
}

function parseOptionalPositiveNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    return undefined;
  }
  return value;
}

function parseWeights(
  value: unknown,
): { vector?: number; bm25?: number } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  const weights: { vector?: number; bm25?: number } = {};
  if (typeof obj.vector === 'number' && Number.isFinite(obj.vector)) {
    weights.vector = obj.vector;
  }
  if (typeof obj.bm25 === 'number' && Number.isFinite(obj.bm25)) {
    weights.bm25 = obj.bm25;
  }
  return Object.keys(weights).length > 0 ? weights : undefined;
}

function parseBool(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

export async function POST(req: Request) {
  const tTotal0 = performance.now();

  try {
    const tValidate0 = performance.now();
    const body = await req.json();
    const query = typeof body.query === 'string' ? body.query : '';
    const k = typeof body.k === 'number' ? body.k : 5;
    const mode = parseMode(body.mode);
    const docId =
      typeof body.docId === 'string' && body.docId !== '无'
        ? body.docId
        : undefined;
    const candidateK = parseOptionalPositiveNumber(body.candidateK);
    const kRrf =
      typeof body.kRrf === 'number' &&
      Number.isFinite(body.kRrf) &&
      body.kRrf >= 0
        ? body.kRrf
        : undefined;
    const weights = parseWeights(body.weights);
    const bypassCache = parseBool(body.bypassCache);
    const rerank = parseBool(body.rerank);

    if (!query.trim()) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }
    if (!mode) {
      return NextResponse.json(
        { error: 'mode must be one of: vector, bm25, hybrid' },
        { status: 400 },
      );
    }
    if (
      body.candidateK !== undefined &&
      body.candidateK !== null &&
      body.candidateK !== '' &&
      candidateK === undefined
    ) {
      return NextResponse.json(
        { error: 'candidateK must be a positive number' },
        { status: 400 },
      );
    }
    if (
      body.kRrf !== undefined &&
      body.kRrf !== null &&
      body.kRrf !== '' &&
      kRrf === undefined
    ) {
      return NextResponse.json(
        { error: 'kRrf must be a non-negative number' },
        { status: 400 },
      );
    }

    const validateMs = performance.now() - tValidate0;
    const trimmedQuery = query.trim();

    // —— 原逻辑（仅向量检索）：保留对照，勿删 ——
    // const { hits, timings: searchTimings } = await searchSnippets(
    //   query,
    //   k,
    //   docId,
    // );
    //
    // const timings: RetrievalTimings = {
    //   validateMs: roundMs(validateMs),
    //   openTableMs: roundMs(searchTimings.openTableMs),
    //   searchMs: roundMs(searchTimings.searchMs),
    //   mapMs: roundMs(searchTimings.mapMs),
    //   totalMs: roundMs(performance.now() - tTotal0),
    // };
    //
    // console.info('[retrieval] timings', {
    //   query: query.trim(),
    //   k,
    //   docId: docId ?? null,
    //   count: hits.length,
    //   timings,
    // });
    //
    // const payload: SearchResponse = {
    //   query: query.trim(),
    //   count: hits.length,
    //   results: hits,
    //   timings,
    // };
    //
    // return NextResponse.json(payload);

    const cacheParams: RetrievalCacheParams = {
      query: trimmedQuery,
      mode,
      k,
      docId,
      candidateK,
      kRrf,
      weights,
    };

    let cacheStatus: RetrievalCacheStatus = 'BYPASS';
    const canUseCache = !bypassCache && isRetrievalCacheEnabled();

    let hits: SearchHit[] = [];
    let timings: RetrievalTimings = {
      validateMs: roundMs(validateMs),
      openTableMs: 0,
      searchMs: 0,
      mapMs: 0,
      totalMs: 0,
    };

    if (canUseCache) {
      const tCache0 = performance.now();
      const cached = await getCachedRetrieval(cacheParams);
      const cacheHitMs = performance.now() - tCache0;

      if (cached) {
        cacheStatus = 'HIT';
        hits = cached.payload.results;
        timings = {
          validateMs: roundMs(validateMs),
          openTableMs: 0,
          searchMs: 0,
          mapMs: 0,
          cacheHitMs: roundMs(cacheHitMs),
          totalMs: 0,
        };
      } else {
        cacheStatus = 'MISS';
      }
    }

    if (cacheStatus !== 'HIT') {
      if (mode === 'vector') {
        const result = await searchSnippets(query, k, docId);
        hits = result.hits;
        timings = {
          validateMs: roundMs(validateMs),
          openTableMs: roundMs(result.timings.openTableMs),
          searchMs: roundMs(result.timings.searchMs),
          mapMs: roundMs(result.timings.mapMs),
          totalMs: 0,
        };
      } else if (mode === 'bm25') {
        const result = await searchBm25(query, k, docId);
        hits = result.hits;
        timings = {
          validateMs: roundMs(validateMs),
          openTableMs: 0,
          searchMs: roundMs(result.timings.searchMs),
          mapMs: 0,
          bm25Ms: roundMs(result.timings.searchMs),
          totalMs: 0,
        };
      } else {
        const result = await hybridSearch(query, k, docId, {
          candidateK,
          kRrf,
          weights,
        });
        hits = result.hits;
        timings = {
          validateMs: roundMs(validateMs),
          openTableMs: roundMs(result.timings.openTableMs),
          searchMs: roundMs(result.timings.searchMs),
          mapMs: roundMs(result.timings.mapMs),
          vectorMs: roundMs(result.timings.vectorMs),
          bm25Ms: roundMs(result.timings.bm25Ms),
          fuseMs: roundMs(result.timings.fuseMs),
          totalMs: 0,
        };
      }

      if (canUseCache && cacheStatus === 'MISS') {
        // 缓存检索态结果（不含 rerank），便于开关重排序时复用
        await setCachedRetrieval(cacheParams, {
          query: trimmedQuery,
          mode,
          count: hits.length,
          results: hits,
        });
      }
    }

    let reranked = false;
    if (rerank && hits.length > 0) {
      const { hits: rerankedHits, rerankMs } = await rerankSearchHits(
        trimmedQuery,
        hits,
        k,
      );
      hits = rerankedHits;
      reranked = true;
      timings = {
        ...timings,
        rerankMs: roundMs(rerankMs),
      };
    }

    const responseCache: RetrievalCacheStatus = canUseCache
      ? cacheStatus
      : 'BYPASS';

    timings = {
      ...timings,
      totalMs: roundMs(performance.now() - tTotal0),
    };

    console.info('[retrieval] timings', {
      query: trimmedQuery,
      mode,
      k,
      docId: docId ?? null,
      candidateK: mode === 'hybrid' ? (candidateK ?? null) : null,
      cache: responseCache,
      reranked,
      count: hits.length,
      timings,
    });

    const payload: SearchResponse = {
      query: trimmedQuery,
      count: hits.length,
      results: hits,
      mode,
      cache: responseCache,
      reranked,
      timings,
    };

    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to search snippets';
    console.error('POST /api/retrieval:', error);
    const status =
      message.includes('required') ||
      message.includes('positive') ||
      message.includes('non-negative') ||
      message.includes('JINA_API_KEY')
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
