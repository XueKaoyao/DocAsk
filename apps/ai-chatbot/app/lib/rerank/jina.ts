import { ProxyAgent, fetch as undiciFetch } from 'undici';
import type { SearchHit } from '@/app/types/RetrievalType';

type JinaRerankResult = {
  index: number;
  relevance_score: number;
};

type JinaRerankResponse = {
  results: JinaRerankResult[];
};

export type JinaRerankItem = {
  index: number;
  score: number;
};

const JINA_RERANK_URL = 'https://api.jina.ai/v1/rerank';

/** Postman 会走系统代理；Node fetch 默认不走。从环境变量读取代理。 */
function resolveProxyUrl(): string | undefined {
  const raw =
    process.env.JINA_HTTPS_PROXY?.trim() ||
    process.env.HTTPS_PROXY?.trim() ||
    process.env.HTTP_PROXY?.trim() ||
    process.env.https_proxy?.trim() ||
    process.env.http_proxy?.trim();
  return raw || undefined;
}

/**
 * 调用 Jina Rerank API，按相关性重排 documents。
 * @returns 按 relevance 降序的 { index, score }（index 为输入 documents 下标）
 */
export async function jinaRerank(
  query: string,
  documents: string[],
  topN = documents.length,
): Promise<JinaRerankItem[]> {
  if (documents.length === 0) return [];

  const apiKey = process.env.JINA_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('JINA_API_KEY is required for rerank');
  }

  const n = Math.min(
    Math.max(1, Number.isFinite(topN) ? Math.floor(topN) : documents.length),
    documents.length,
  );

  const proxyUrl = resolveProxyUrl();
  const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

  const requestBody = {
    model: 'jina-reranker-v2-base-multilingual',
    query,
    documents,
    top_n: n,
  };

  console.info('[jina] rerank request body', {
    model: requestBody.model,
    query: requestBody.query,
    documents: requestBody.documents,
    top_n: requestBody.top_n,
  });

  let response: Awaited<ReturnType<typeof undiciFetch>>;
  try {
    response = await undiciFetch(JINA_RERANK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      ...(dispatcher ? { dispatcher } : {}),
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const hint = proxyUrl
      ? `当前代理 ${proxyUrl}`
      : '未配置 HTTPS_PROXY；若 Postman 能通而 Node 不能，请在 .env 设置 HTTPS_PROXY（如 http://127.0.0.1:7890）';
    throw new Error(`无法连接 Jina API: ${raw}。${hint}`);
  }

  const text = await response.text();
  let data: JinaRerankResponse;
  try {
    data = JSON.parse(text) as JinaRerankResponse;
  } catch {
    throw new Error(
      `Invalid Jina rerank response (${response.status}): ${text.slice(0, 200)}`,
    );
  }

  if (!response.ok) {
    const errBody = data as unknown as { detail?: unknown };
    const detail =
      typeof errBody.detail === 'string' ? errBody.detail : text.slice(0, 200);
    throw new Error(`Jina rerank failed (${response.status}): ${detail}`);
  }

  if (!data?.results || !Array.isArray(data.results)) {
    throw new Error('Invalid Jina rerank response: missing results');
  }

  console.info('[jina] rerank response', {
    status: response.status,
    results: data.results.map((item) => ({
      index: item.index,
      relevance_score: item.relevance_score,
    })),
  });

  return data.results.map((item) => ({
    index: item.index,
    score: item.relevance_score,
  }));
}

/**
 * 对检索命中片段做 Jina 重排序；score 替换为 relevance_score。
 */
export async function rerankSearchHits(
  query: string,
  hits: SearchHit[],
  topN = hits.length,
): Promise<{ hits: SearchHit[]; rerankMs: number }> {
  if (hits.length === 0) {
    return { hits: [], rerankMs: 0 };
  }

  const t0 = performance.now();
  // 统一为以 ? 结尾，避免「有/无问号」导致重排分数不一致
  const normalizedQuery = `${query.trim().replace(/[?？]+$/u, '')}?`;
  const ranked = await jinaRerank(
    normalizedQuery,
    hits.map((h) => h.snippet),
    topN,
  );
  const rerankMs = performance.now() - t0;

  const next: SearchHit[] = [];
  for (const { index, score } of ranked) {
    const hit = hits[index];
    if (!hit) continue;
    next.push({ ...hit, score });
  }

  return { hits: next, rerankMs };
}
