import type { SearchHit } from '@/app/types/RetrievalType';

const mockSearchSnippets = jest.fn();
const mockSearchBm25 = jest.fn();

jest.mock('@/app/lib/chunks', () => ({
  searchSnippets: (...args: unknown[]) => mockSearchSnippets(...args),
}));

jest.mock('@/app/lib/bm25', () => ({
  searchBm25: (...args: unknown[]) => mockSearchBm25(...args),
}));

import { hybridSearch } from '../hybridSearch';

function hit(id: string, score: number): SearchHit {
  return {
    id,
    documentId: 'doc1',
    title: 't',
    filename: 'f.txt',
    page: 0,
    snippet: `snippet-${id}`,
    index: 0,
    score,
  };
}

describe('hybridSearch', () => {
  beforeEach(() => {
    mockSearchSnippets.mockReset();
    mockSearchBm25.mockReset();
  });

  it('calls both retrievers with candidateK and fuses by RRF', async () => {
    mockSearchSnippets.mockResolvedValue({
      hits: [hit('a', 0.9), hit('b', 0.8), hit('c', 0.7)],
      timings: { openTableMs: 1, searchMs: 2, mapMs: 3 },
    });
    mockSearchBm25.mockResolvedValue({
      hits: [hit('b', 5), hit('d', 4), hit('a', 3)],
      timings: { searchMs: 4 },
    });

    const { hits } = await hybridSearch('密码', 3, undefined, {
      candidateK: 10,
      kRrf: 60,
    });

    expect(mockSearchSnippets).toHaveBeenCalledWith('密码', 10, undefined);
    expect(mockSearchBm25).toHaveBeenCalledWith('密码', 10, undefined);
    expect(hits.map((h) => h.id)).toEqual(['b', 'a', 'd']);
    expect(hits[0]!.snippet).toBe('snippet-b');
    expect(hits[0]!.score).toBeCloseTo(1 / 62 + 1 / 61, 10);
  });

  it('degrades to bm25 when vector fails', async () => {
    mockSearchSnippets.mockRejectedValue(new Error('lance down'));
    mockSearchBm25.mockResolvedValue({
      hits: [hit('x', 1), hit('y', 0.5)],
      timings: { searchMs: 1 },
    });

    const { hits } = await hybridSearch('q', 2, 'doc1', { candidateK: 5 });
    expect(mockSearchBm25).toHaveBeenCalledWith('q', 5, 'doc1');
    expect(hits.map((h) => h.id)).toEqual(['x', 'y']);
  });

  it('throws when both retrievers fail', async () => {
    mockSearchSnippets.mockRejectedValue(new Error('vector fail'));
    mockSearchBm25.mockRejectedValue(new Error('bm25 fail'));
    await expect(hybridSearch('q', 5)).rejects.toThrow('vector fail');
  });
});
