jest.mock('pdf-parse', () => ({
  PDFParse: class PDFParse {
    async getText() {
      return { pages: [], text: '', total: 0 };
    }
    async destroy() {}
  },
}));

import { cleanPdfText } from '../pdf';

describe('cleanPdfText', () => {
  it('strips -- N of M -- page footers', () => {
    const raw = [
      '公司简介',
      '-- 1 of 4 --',
      'Cloris AI 成立于 2024 年。',
      '-- 2 of 4 --',
      '安全规范',
    ].join('\n');

    const cleaned = cleanPdfText(raw);
    expect(cleaned).not.toMatch(/\d+\s+of\s+\d+/i);
    expect(cleaned).toContain('公司简介');
    expect(cleaned).toContain('安全规范');
  });

  it('strips --- Page N --- markers', () => {
    const cleaned = cleanPdfText('AAA\n--- Page 2 ---\nBBB');
    expect(cleaned).not.toContain('Page 2');
    expect(cleaned).toContain('AAA');
    expect(cleaned).toContain('BBB');
  });

  it('normalizes bullet glyphs', () => {
    const cleaned = cleanPdfText('\uF0B7 React\n\u2022 TypeScript');
    expect(cleaned).toContain('- React');
    expect(cleaned).toContain('- TypeScript');
  });

  it('joins soft line breaks inside a sentence', () => {
    const cleaned = cleanPdfText(
      '公司的核心产品包\n括知识库与问答。\n\n下一节',
    );
    expect(cleaned).toContain('公司的核心产品包括知识库与问答。');
    expect(cleaned).toContain('下一节');
  });
});
