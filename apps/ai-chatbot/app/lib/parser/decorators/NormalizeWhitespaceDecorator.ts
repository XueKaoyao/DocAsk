import { ParserDecorator } from './ParserDecorator';
import type { ParseInput, ParseResult } from '../type';

/** 统一换行并压缩多余空白 */
export class NormalizeWhitespaceDecorator extends ParserDecorator {
  async parse(input: ParseInput): Promise<ParseResult> {
    const result = await this.inner.parse(input);
    const normalize = (text: string) =>
      text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();

    return {
      ...result,
      text: normalize(result.text),
      pages: result.pages?.map((p) => ({ ...p, text: normalize(p.text) })),
    };
  }
}
