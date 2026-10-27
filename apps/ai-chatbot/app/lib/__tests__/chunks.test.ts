jest.mock('@/app/lib/lancedb', () => ({
  upsertChunkRows: jest.fn(),
  deleteChunksByDocumentId: jest.fn(),
  dropChunksTable: jest.fn(),
  openChunkTable: jest.fn(),
}));

import { buildChunkRows } from '../chunks';

describe('buildChunkRows', () => {
  const doc = {
    id: 'doc-1',
    title: '员工手册',
    filename: 'handbook.pdf',
    content: '全文备用内容。第二句。',
  };

  it('chunks full content with page=0 when pages omitted', () => {
    const rows = buildChunkRows(doc);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.page === 0)).toBe(true);
    expect(rows.every((r) => r.filename === 'handbook.pdf')).toBe(true);
  });

  it('chunks each page and stamps real page numbers', () => {
    const rows = buildChunkRows(doc, {
      pages: [
        { num: 1, text: '第一页内容。还有一句。' },
        { num: 2, text: '第二页内容。再来一句。' },
        { num: 3, text: '   ' }, // 空页跳过
      ],
    });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.page === 1)).toBe(true);
    expect(rows.some((r) => r.page === 2)).toBe(true);
    expect(rows.every((r) => r.page !== 3)).toBe(true);
    expect(rows.every((r) => r.filename === 'handbook.pdf')).toBe(true);

    rows.forEach((r, i) => {
      expect(r.index).toBe(i);
      expect(r.id).toBe(`doc-1#${i}`);
    });
  });
});
