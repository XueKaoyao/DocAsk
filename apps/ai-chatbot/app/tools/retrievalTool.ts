import { tool } from 'ai';
import { z } from 'zod';
import { searchSnippets, type SearchHit } from '@/app/lib/chunks';
import type { RetrievalStreamEvent } from '@/app/types/RetrievalType';

export type RetrievalToolResult = {
  count: number;
  titles: string[];
  results: Array<
    Pick<SearchHit, 'title' | 'filename' | 'page' | 'snippet' | 'score'>
  >;
};

/** 检索进度回调：由 chat route 注入 writer.write(data-retrieval) */
export type RetrievalProgressEmit = (event: RetrievalStreamEvent) => void;

const DEFAULT_K = 3;

/** 伪流式帧间隔：让「正在检索」有机会先刷到 UI（test 环境为 0） */
const PROGRESS_GAP_MS =
  process.env.NODE_ENV === 'test'
    ? 0
    : Number(process.env.RETRIEVAL_PROGRESS_GAP_MS ?? 80);

function wait(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapHitsToResult(hits: SearchHit[]): RetrievalToolResult {
  const titles = [...new Set(hits.map((h) => h.title))];
  return {
    count: hits.length,
    titles,
    results: hits.map((h) => ({
      title: h.title,
      filename: h.filename,
      page: h.page,
      snippet: h.snippet,
      score: h.score,
    })),
  };
}

/**
 * 创建可注入进度回调的检索 tools。
 * emit 用于 UI 流式进度；return 的仍是完整 tool result（给模型）。
 */
export function createRetrievalTools(emit: RetrievalProgressEmit = () => {}) {
  const getInformation = tool({
    description:
      '从知识库检索与用户问题相关的文档片段。回答事实性问题前应先调用本工具。',
    inputSchema: z.object({
      question: z.string().describe('用户的问题或检索关键词'),
    }),
    execute: async (
      { question },
      { toolCallId },
    ): Promise<RetrievalToolResult> => {
      emit({ type: 'start', toolCallId, question });
      // 先让出事件循环，确保 start 帧能推到客户端再继续
      await wait(PROGRESS_GAP_MS);

      try {
        const { hits } = await searchSnippets(question, DEFAULT_K);

        // 伪流式：检索一次算完后按条 emit，便于前端逐条展示
        for (let i = 0; i < hits.length; i++) {
          const h = hits[i]!;
          emit({
            type: 'hit',
            toolCallId,
            index: i,
            hit: {
              title: h.title,
              filename: h.filename,
              page: h.page,
              snippet: h.snippet,
              score: h.score,
            },
          });
          await wait(PROGRESS_GAP_MS);
        }

        const output = mapHitsToResult(hits);
        emit({
          type: 'done',
          toolCallId,
          count: output.count,
          titles: output.titles,
        });
        return output;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'knowledge base search failed';
        emit({ type: 'error', toolCallId, message });
        throw err;
      }
    },
  });

  return { getInformation };
}

/**
 * 默认 tools（emit 为空操作）。chat route 已用 createRetrievalTools(emit) 注入进度；
 * 此导出仍可供测试或其它无 UI stream 的调用方使用。
 */
export const retrievalTools = createRetrievalTools();

/** @deprecated 使用 retrievalTools.getInformation 或 createRetrievalTools */
export const getInformation = retrievalTools.getInformation;

// —— 原逻辑（无进度 emit）：保留对照，勿删 ——
// export const getInformation = tool({
//   description:
//     '从知识库检索与用户问题相关的文档片段。回答事实性问题前应先调用本工具。',
//   inputSchema: z.object({
//     question: z.string().describe('用户的问题或检索关键词'),
//   }),
//   execute: async ({ question }): Promise<RetrievalToolResult> => {
//     const { hits } = await searchSnippets(question, DEFAULT_K);
//     const titles = [...new Set(hits.map((h) => h.title))];
//     return {
//       count: hits.length,
//       titles,
//       results: hits.map((h) => ({
//         title: h.title,
//         filename: h.filename,
//         page: h.page,
//         snippet: h.snippet,
//         score: h.score,
//       })),
//     };
//   },
// });
//
// export const retrievalTools = {
//   getInformation,
// };
