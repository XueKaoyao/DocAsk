import { chunkDocument } from '@/app/lib/similarity';
import type { Document } from '@/app/generated/prisma/client';
import {
  deleteChunksByDocumentId,
  dropChunksTable,
  openChunkTable,
  upsertChunkRows,
  type LanceChunkRow,
} from '@/app/lib/lancedb';
import type { RetrievalTimings } from '@/app/types/RetrievalType';
import {
  onChunksUpserted,
  onChunksDeletedByDocumentId,
  onChunksTableDropped,
} from './bm25/sync';
import { invalidateRetrievalCache } from './redis';

async function invalidateRetrievalCacheSafe(context: string): Promise<void> {
  try {
    await invalidateRetrievalCache();
  } catch (err) {
    console.error(`[redis] invalidate after ${context} failed:`, err);
  }
}

// --- 原手动 embed（@xenova/transformers）已停用，改由 LanceDB Embedding Function 自动生成 ---
// import { embed } from '@/app/lib/embedding';

// --- 原 Postgres Chunk + topKSimilar 方案（已停用，改用 LanceDB）---
// import { prisma } from '@/app/lib/prisma';
// import { chunkDocument, topKSimilar } from '@/app/lib/similarity';
// import type { Chunk, Document } from '@/app/generated/prisma/client';

export type SearchHit = {
  id: string;
  documentId: string;
  title: string;
  /** 来源文件名；旧数据可能为空串 */
  filename: string;
  /** PDF 页码（1-based）；0 表示非分页或未知 */
  page: number;
  snippet: string;
  score: number;
  index: number;
};

/** searchSnippets 内部可测的三段耗时 */
export type SearchSnippetsTimings = Pick<
  RetrievalTimings,
  'openTableMs' | 'searchMs' | 'mapMs'
>;

export type SearchSnippetsResult = {
  hits: SearchHit[];
  timings: SearchSnippetsTimings;
};

/** 分页文本（来自 PDF 等）；按页切块时使用 */
export type DocumentPage = {
  /** 1-based 页码 */
  num: number;
  text: string;
};

export type IndexDocumentChunksOptions = {
  /**
   * 若提供，则对每一页分别递归切块，并写入真实 page。
   * 未提供时回退为对 document.content 全文切块，page=0。
   */
  pages?: DocumentPage[];
};

/**
 * 根据 Document + 可选分页，生成待写入 LanceDB 的行（不含 vector）。
 * 供 indexDocumentChunks 与单测共用。
 */
export function buildChunkRows(
  document: Pick<Document, 'id' | 'title' | 'filename' | 'content'>,
  options: IndexDocumentChunksOptions = {},
): LanceChunkRow[] {
  const filename = document.filename?.trim() || document.title;
  const pages = options.pages?.filter((p) => p.text.trim().length > 0);

  const rows: LanceChunkRow[] = [];
  let globalIndex = 0;

  if (pages && pages.length > 0) {
    for (const page of pages) {
      const parts = chunkDocument(page.text, document.id);
      for (const part of parts) {
        rows.push({
          id: `${document.id}#${globalIndex}`,
          documentId: document.id,
          title: document.title,
          filename,
          page: page.num,
          snippet: part.text,
          index: globalIndex,
        });
        globalIndex += 1;
      }
    }
    return rows;
  }

  // 无分页：全文切块，page=0 表示未知/非 PDF
  const parts = chunkDocument(document.content, document.id);
  return parts.map((part, i) => ({
    id: `${document.id}#${i}`,
    documentId: document.id,
    title: document.title,
    filename,
    page: 0,
    snippet: part.text,
    index: i,
  }));
}

/** 将文档切分后写入 LanceDB（vector 由 Embedding Function 根据 snippet 自动生成） */
export async function indexDocumentChunks(
  document: Document,
  options: IndexDocumentChunksOptions = {},
): Promise<void> {
  const rows = buildChunkRows(document, options);
  if (rows.length === 0) {
    return;
  }
  await upsertChunkRows(rows);

  // 切块入库后同步 BM25 语料；rebuild 时经 prepTask 分词并 consolidate
  try {
    await onChunksUpserted(rows);
  } catch (err) {
    console.error('[bm25] sync after indexDocumentChunks failed:', err);
  }
  // 语料变更后清空检索结果缓存，避免读到旧片段
  await invalidateRetrievalCacheSafe('indexDocumentChunks');

  // --- 原方案：本地 embed 后写入 vector ---
  // const rows: LanceChunkRow[] = [];
  // for (let i = 0; i < parts.length; i++) {
  //   const vector = await embed(parts[i].text);
  //   rows.push({
  //     id: `${document.id}#${i}`,
  //     documentId: document.id,
  //     title: document.title,
  //     snippet: parts[i].text,
  //     index: i,
  //     vector,
  //   });
  // }

  // --- 原方案：写入 Prisma Chunk.embedding ---
  // const data = [];
  // for (let i = 0; i < parts.length; i++) {
  //   const embedding = await embed(parts[i].text);
  //   data.push({
  //     documentId: document.id,
  //     content: parts[i].text,
  //     embedding,
  //     index: i,
  //   });
  // }
  // return prisma.chunk.createManyAndReturn({ data });
}

/** 语义检索：table.search(query) 由 LanceDB 自动 embed query；附带分段耗时 */
export async function searchSnippets(
  query: string,
  k = 5,
  docId?: string,
): Promise<SearchSnippetsResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error('query is required');
  }
  if (!Number.isFinite(k) || k < 1) {
    throw new Error('k must be a positive number');
  }

  const tOpen0 = performance.now();
  const table = await openChunkTable();
  const openTableMs = performance.now() - tOpen0;

  if (!table) {
    return {
      hits: [],
      timings: { openTableMs, searchMs: 0, mapMs: 0 },
    };
  }

  const tSearch0 = performance.now();
  let newQuery = table.search(trimmed);
  if (docId) {
    newQuery = newQuery.where(`documentId = '${docId}'`);
  }
  const results = await newQuery
    .limit(k)
    .select([
      'id',
      'documentId',
      'title',
      'filename',
      'page',
      'snippet',
      'index',
      '_distance',
    ])
    .toArray();
  const searchMs = performance.now() - tSearch0;

  const tMap0 = performance.now();
  const hits: SearchHit[] = results.map((row) => {
    const distance = Number(row._distance ?? 0);
    return {
      id: String(row.id),
      documentId: String(row.documentId),
      title: String(row.title),
      filename: String(row.filename ?? ''),
      page: Number(row.page ?? 0),
      snippet: String(row.snippet),
      index: Number(row.index),
      score: 1 / (1 + distance),
    };
  });
  const mapMs = performance.now() - tMap0;

  return {
    hits,
    timings: { openTableMs, searchMs, mapMs },
  };
}

/** 删除某文档在 LanceDB 中的向量 */
export async function removeDocumentChunks(documentId: string): Promise<void> {
  await deleteChunksByDocumentId(documentId);
  try {
    await onChunksDeletedByDocumentId(documentId);
  } catch (err) {
    console.error('[bm25] sync after removeDocumentChunks failed:', err);
  }
  await invalidateRetrievalCacheSafe('removeDocumentChunks');
}

/** 清空 LanceDB chunks 表 */
export async function clearAllChunks(): Promise<void> {
  await dropChunksTable();
  try {
    await onChunksTableDropped();
  } catch (err) {
    console.error('[bm25] sync after clearAllChunks failed:', err);
  }
  await invalidateRetrievalCacheSafe('clearAllChunks');
}
