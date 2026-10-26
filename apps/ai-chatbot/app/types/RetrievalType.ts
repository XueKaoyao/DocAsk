export interface EmbedResType {
  embedding: number[];
  dimensions: number;
  similarity?: number;
}

export interface CandidateResult {
  id: string;
  score: number;
}

export interface DocumentType {
  id: string;
  createdAt: string;
  content: string;
  title: string;
  filename?: string;
  updatedAt: string;
}

export interface SearchHit {
  id: string;
  documentId: string;
  title: string;
  filename: string;
  page: number;
  snippet: string;
  score: number;
  index: number;
}

/** POST /api/retrieval 的检索模式；缺省为 hybrid */
export type RetrievalMode = 'vector' | 'bm25' | 'hybrid';

/** Redis 检索结果缓存状态 */
export type RetrievalCacheStatus = 'HIT' | 'MISS' | 'BYPASS';

/**
 * RAG/检索各阶段耗时（毫秒，墙钟时间）。
 *
 * 边界约定：
 * - total：进入 POST handler 到构造完响应体之前
 * - validate：解析 body + 参数校验
 * - openTable：打开/检查 LanceDB chunks 表（vector / hybrid）
 * - search：主检索耗时（vector=ANN；bm25=关键词；hybrid=两路并行墙钟）
 * - map：结果映射 / RRF 融合相关
 * - vectorMs / bm25Ms / fuseMs：hybrid 可选细分
 * - cacheHitMs：缓存命中时读 Redis 的耗时
 * - rerankMs：Jina 重排序耗时（仅启用 rerank 时）
 */
export interface RetrievalTimings {
  totalMs: number;
  validateMs: number;
  openTableMs: number;
  searchMs: number;
  mapMs: number;
  vectorMs?: number;
  bm25Ms?: number;
  fuseMs?: number;
  cacheHitMs?: number;
  rerankMs?: number;
}

export interface SearchResponse {
  query: string;
  count: number;
  results: SearchHit[];
  /** 实际使用的检索模式 */
  mode?: RetrievalMode;
  /** Redis 缓存：HIT / MISS / BYPASS（bypassCache 或缓存关闭） */
  cache?: RetrievalCacheStatus;
  /** 是否对结果做了 Jina 重排序 */
  reranked?: boolean;
  /** 启用重排序但失败时的说明（此时 results 仍为检索序） */
  rerankError?: string;
  /** 分段耗时（毫秒），由 POST /api/retrieval 写入 */
  timings?: RetrievalTimings;
}

/**
 * 聊天 UI 流式推送的单条命中（比 SearchHit 更瘦，给前端进度条用）。
 * 不含 id/documentId/index，完整字段仍在 tool result 里给模型。
 */
export type RetrievalStreamHit = {
  title: string;
  filename: string;
  page: number;
  snippet: string;
  score: number;
};

/**
 * createUIMessageStream 中 writer.write({ type: 'data-retrieval', data }) 的 data 契约。
 * - start：开始检索（可显示「正在检索…」）
 * - hit：伪流式逐条命中
 * - done：本轮 toolCall 检索结束（与 tool output 对齐）
 * - error：检索失败
 */
export type RetrievalStreamEvent =
  | {
      type: 'start';
      toolCallId: string;
      question: string;
    }
  | {
      type: 'hit';
      toolCallId: string;
      index: number;
      hit: RetrievalStreamHit;
    }
  | {
      type: 'done';
      toolCallId: string;
      count: number;
      titles: string[];
    }
  | {
      type: 'error';
      toolCallId?: string;
      message: string;
    };

/** AI SDK UIMessage 自定义 data part：type 必须为 data-<name> */
export type AppDataParts = {
  retrieval: RetrievalStreamEvent;
};

/**
 * 生成 data-retrieval part 的 id（同 id 会被客户端 reconcile/更新）。
 * - start/done/error：用 toolCallId
 * - hit：用 toolCallId-index，避免后一条覆盖前一条
 */
export function buildRetrievalDataPartId(event: RetrievalStreamEvent): string {
  if (event.type === 'hit') {
    return `${event.toolCallId}-${event.index}`;
  }
  if (event.type === 'error') {
    return event.toolCallId ?? 'retrieval-error';
  }
  return event.toolCallId;
}

/** 写入 UI stream 的 data-retrieval 帧（供 route 使用） */
export function toRetrievalDataPart(event: RetrievalStreamEvent): {
  type: 'data-retrieval';
  id: string;
  data: RetrievalStreamEvent;
} {
  return {
    type: 'data-retrieval',
    id: buildRetrievalDataPartId(event),
    data: event,
  };
}
