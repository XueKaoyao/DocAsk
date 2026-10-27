import { Parser } from '../Parser';
import type { ParseInput, ParseResult } from '../type';

/** 装饰器基类：包装另一个 Parser，默认委托 supports */
export abstract class ParserDecorator extends Parser {
  constructor(protected readonly inner: Parser) {
    super();
  }

  supports(filename: string, mime?: string): boolean {
    return this.inner.supports(filename, mime);
  }

  abstract parse(input: ParseInput): Promise<ParseResult>;
}
