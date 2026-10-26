import { Parser } from './Parser';
import { PDFParser } from './PDFParser';
import { MarkdownParser } from './MarkdownParser';
import { TXTParser } from './TXTParser';
import { CSVParser } from './CSVParser';
import { WordParser } from './WordParser';
import { CleanTextDecorator } from './decorators/CleanTextDecorator';
import { EmptyGuardDecorator } from './decorators/EmptyGuardDecorator';
import { NormalizeWhitespaceDecorator } from './decorators/NormalizeWhitespaceDecorator';
import { UnsupportedFileTypeError } from './type';

const strategies: Parser[] = [
  new PDFParser(),
  new MarkdownParser(),
  new TXTParser(),
  new CSVParser(),
  new WordParser(),
];

/**
 * 按文件名 / mime 选择策略，并组装装饰链。
 * PDF：EmptyGuard → CleanText → PDFParser
 * 其它：EmptyGuard → NormalizeWhitespace → 策略
 */
export class ParserFactory {
  static listStrategies(): Parser[] {
    return [...strategies];
  }

  static create(filename: string, mime?: string): Parser {
    const base = strategies.find((s) => s.supports(filename, mime));
    if (!base) {
      throw new UnsupportedFileTypeError(filename);
    }

    const prepared =
      base instanceof PDFParser
        ? new CleanTextDecorator(base)
        : new NormalizeWhitespaceDecorator(base);

    return new EmptyGuardDecorator(prepared);
  }
}
