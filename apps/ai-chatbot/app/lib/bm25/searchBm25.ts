import type { SearchHit } from '@/app/types/RetrievalType';
import { getCorpusDoc } from './corpus';
import { searchEngine } from './winkEngine';

export type SearchBm25Result = {
  hits: SearchHit[];
  timings: { searchMs: number };
};

/** BM25 检索并映射为 SearchHit（与向量检索结果形状对齐） */
export async function searchBm25(
  query: string,
  k = 5,
  docId?: string,
): Promise<SearchBm25Result> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error('query is required');
  }
  if (!Number.isFinite(k) || k < 1) {
    throw new Error('k must be a positive number');
  }

  const t0 = performance.now();
  const pairs = await searchEngine(trimmed, k, docId);
  const hits: SearchHit[] = [];

  for (const { id, score } of pairs) {
    const doc = await getCorpusDoc(id);
    if (!doc) continue;
    if (docId && doc.documentId !== docId) continue;
    hits.push({
      id,
      documentId: doc.documentId,
      title: doc.title,
      filename: doc.filename,
      page: doc.page,
      snippet: doc.snippet,
      index: doc.index,
      score,
    });
  }

  return {
    hits,
    timings: { searchMs: performance.now() - t0 },
  };
}
