import { NextResponse } from 'next/server';
import { getInvertedIndex, searchBm25 } from '@/app/lib/bm25';

function roundMs(ms: number): number {
  return Math.round(ms * 100) / 100;
}

/**
 * GET /api/bm25 — 查看倒排表：term → chunkId[]（与 prepTask / fldWeights 一致）
 */
export async function GET() {
  try {
    const index = await getInvertedIndex();
    return NextResponse.json({
      termCount: index.termCount,
      chunkCount: index.chunkCount,
      /** 词 → 出现该词的 chunk id 列表 */
      inverted: index.inverted,
      /** 按词排序的列表视图：{ term, df, chunkIds } */
      entries: index.entries,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to load BM25 inverted index';
    console.error('GET /api/bm25:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/bm25 — 关键词 BM25 检索（与 /api/retrieval 向量检索独立）
 * body: { query: string, k?: number, docId?: string }
 */
export async function POST(req: Request) {
  const tTotal0 = performance.now();

  try {
    const body = await req.json();
    const query = typeof body.query === 'string' ? body.query : '';
    const k = typeof body.k === 'number' ? body.k : 5;
    const docId =
      typeof body.docId === 'string' && body.docId !== '无'
        ? body.docId
        : undefined;

    if (!query.trim()) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }

    const { hits, timings: searchTimings } = await searchBm25(query, k, docId);

    const payload = {
      query: query.trim(),
      count: hits.length,
      results: hits,
      timings: {
        searchMs: roundMs(searchTimings.searchMs),
        totalMs: roundMs(performance.now() - tTotal0),
      },
    };

    console.info('[bm25] search', {
      query: payload.query,
      k,
      docId: docId ?? null,
      count: hits.length,
      timings: payload.timings,
    });

    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to BM25 search';
    console.error('POST /api/bm25:', error);
    const status =
      message.includes('required') || message.includes('positive') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
