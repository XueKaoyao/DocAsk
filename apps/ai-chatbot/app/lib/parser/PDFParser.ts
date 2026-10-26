import { Parser } from './Parser';
import type { ParseInput, ParseResult } from './type';

/**
 * PDF 策略：只抽出原文与分页，不做清洗。
 * 清洗由工厂套上的 CleanTextDecorator 完成。
 */
export class PDFParser extends Parser {
  supports(filename: string, mime?: string): boolean {
    if (mime === 'application/pdf') return true;
    return this.extensionOf(filename) === '.pdf';
  }

  async parse(input: ParseInput): Promise<ParseResult> {
    // 动态导入，避免非 PDF 测试静态加载 pdf-parse
    const { PDFParse } = await import('pdf-parse');

    const parser = new PDFParse({ data: input.data });
    try {
      const result = await parser.getText();
      return {
        text: result.text,
        pages: result.pages.map((p) => ({
          num: p.num,
          text: p.text,
        })),
        numpages: result.total,
        suggestedTitle: this.titleFromFilename(input.filename),
      };
    } finally {
      await parser.destroy();
    }
  }
}

export class EmptyPdfTextError extends Error {
  readonly numpages: number;

  constructor(numpages: number) {
    super('未能从 PDF 提取到文字，可能是扫描件或纯图片 PDF（当前不支持 OCR）');
    this.name = 'EmptyPdfTextError';
    this.numpages = numpages;
  }
}
