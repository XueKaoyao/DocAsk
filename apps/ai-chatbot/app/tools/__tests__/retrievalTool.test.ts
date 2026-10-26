// cd apps/ai-chatbot
// pnpm exec jest --config jest.config.cjs --testPathPatterns=retrievalTool

const mockSearchSnippets = jest.fn();

jest.mock('@/app/lib/chunks', () => ({
  searchSnippets: (...args: unknown[]) => mockSearchSnippets(...args),
}));

/** 将 tool() 做成透传，便于直接测 execute 逻辑 */
jest.mock('ai', () => ({
  tool: <T>(definition: T) => definition,
}));

jest.mock('zod', () => {
  const chain = {
    describe: () => chain,
  };
  return {
    z: {
      object: (shape: unknown) => shape,
      string: () => chain,
    },
  };
});

import {
  createRetrievalTools,
  getInformation,
  retrievalTools,
} from '../retrievalTool';
import type { SearchHit } from '@/app/lib/chunks';
import type { RetrievalStreamEvent } from '@/app/types/RetrievalType';

function hit(
  overrides: Partial<SearchHit> & Pick<SearchHit, 'title' | 'snippet'>,
): SearchHit {
  return {
    id: 'doc#0',
    documentId: 'doc',
    filename: '',
    page: 0,
    score: 0.9,
    index: 0,
    ...overrides,
  };
}

type ExecuteFn = (
  input: { question: string },
  options: { toolCallId: string; messages: unknown[] },
) => Promise<{
  count: number;
  titles: string[];
  results: Array<{
    title: string;
    filename: string;
    page: number;
    snippet: string;
    score: number;
  }>;
}>;

describe('retrievalTool', () => {
  beforeEach(() => {
    mockSearchSnippets.mockReset();
  });

  it('exports getInformation on retrievalTools', () => {
    expect(retrievalTools.getInformation).toBe(getInformation);
    expect(typeof getInformation.execute).toBe('function');
  });

  it('calls searchSnippets with question and k=3', async () => {
    mockSearchSnippets.mockResolvedValueOnce({
      hits: [],
      timings: { openTableMs: 0, searchMs: 0, mapMs: 0 },
    });

    const execute = getInformation.execute as ExecuteFn;
    await execute(
      { question: '什么是向量检索' },
      { toolCallId: 'call-1', messages: [] },
    );

    expect(mockSearchSnippets).toHaveBeenCalledTimes(1);
    expect(mockSearchSnippets).toHaveBeenCalledWith('什么是向量检索', 3);
  });

  it('maps hits to count, unique titles, and results', async () => {
    mockSearchSnippets.mockResolvedValueOnce({
      hits: [
        hit({
          id: 'a#0',
          documentId: 'a',
          title: 'RAG 简介',
          filename: 'rag.md',
          page: 0,
          snippet: 'RAG 是检索增强生成',
          score: 0.95,
          index: 0,
        }),
        hit({
          id: 'a#1',
          documentId: 'a',
          title: 'RAG 简介',
          filename: 'rag.md',
          page: 0,
          snippet: '常用于知识库问答',
          score: 0.88,
          index: 1,
        }),
        hit({
          id: 'b#0',
          documentId: 'b',
          title: '向量检索',
          filename: 'handbook.pdf',
          page: 2,
          snippet: '用 embedding 找相似片段',
          score: 0.8,
          index: 0,
        }),
      ],
      timings: { openTableMs: 1, searchMs: 2, mapMs: 0.1 },
    });

    const execute = getInformation.execute as ExecuteFn;
    const result = await execute(
      { question: 'RAG' },
      { toolCallId: 'call-2', messages: [] },
    );

    expect(result).toEqual({
      count: 3,
      titles: ['RAG 简介', '向量检索'],
      results: [
        {
          title: 'RAG 简介',
          filename: 'rag.md',
          page: 0,
          snippet: 'RAG 是检索增强生成',
          score: 0.95,
        },
        {
          title: 'RAG 简介',
          filename: 'rag.md',
          page: 0,
          snippet: '常用于知识库问答',
          score: 0.88,
        },
        {
          title: '向量检索',
          filename: 'handbook.pdf',
          page: 2,
          snippet: '用 embedding 找相似片段',
          score: 0.8,
        },
      ],
    });
  });

  it('returns empty payload when knowledge base has no hits', async () => {
    mockSearchSnippets.mockResolvedValueOnce({
      hits: [],
      timings: { openTableMs: 0, searchMs: 0, mapMs: 0 },
    });

    const execute = getInformation.execute as ExecuteFn;
    const result = await execute(
      { question: '不存在的主题' },
      { toolCallId: 'call-3', messages: [] },
    );

    expect(result).toEqual({
      count: 0,
      titles: [],
      results: [],
    });
  });

  it('propagates searchSnippets errors', async () => {
    mockSearchSnippets.mockRejectedValueOnce(new Error('LanceDB unavailable'));

    const execute = getInformation.execute as ExecuteFn;
    await expect(
      execute({ question: '任意问题' }, { toolCallId: 'call-4', messages: [] }),
    ).rejects.toThrow('LanceDB unavailable');
  });

  it('emits start → hit* → done for createRetrievalTools', async () => {
    const events: RetrievalStreamEvent[] = [];
    const tools = createRetrievalTools((e) => {
      events.push(e);
    });
    const execute = tools.getInformation.execute as ExecuteFn;

    mockSearchSnippets.mockResolvedValueOnce({
      hits: [
        hit({
          title: 'A',
          filename: 'a.md',
          snippet: 'sa',
          score: 0.9,
        }),
        hit({
          title: 'B',
          filename: 'b.md',
          snippet: 'sb',
          score: 0.8,
          index: 1,
        }),
      ],
      timings: { openTableMs: 0, searchMs: 0, mapMs: 0 },
    });

    await execute(
      { question: '测试问题' },
      { toolCallId: 'call-emit', messages: [] },
    );

    expect(events.map((e) => e.type)).toEqual(['start', 'hit', 'hit', 'done']);
    expect(events[0]).toMatchObject({
      type: 'start',
      toolCallId: 'call-emit',
      question: '测试问题',
    });
    expect(events[1]).toMatchObject({
      type: 'hit',
      toolCallId: 'call-emit',
      index: 0,
      hit: { title: 'A', snippet: 'sa' },
    });
    expect(events[3]).toMatchObject({
      type: 'done',
      toolCallId: 'call-emit',
      count: 2,
      titles: ['A', 'B'],
    });
  });

  it('emits error then rethrows when search fails', async () => {
    const events: RetrievalStreamEvent[] = [];
    const tools = createRetrievalTools((e) => {
      events.push(e);
    });
    const execute = tools.getInformation.execute as ExecuteFn;

    mockSearchSnippets.mockRejectedValueOnce(new Error('down'));

    await expect(
      execute({ question: 'x' }, { toolCallId: 'call-err', messages: [] }),
    ).rejects.toThrow('down');

    expect(events.map((e) => e.type)).toEqual(['start', 'error']);
    expect(events[1]).toMatchObject({
      type: 'error',
      toolCallId: 'call-err',
      message: 'down',
    });
  });
});
