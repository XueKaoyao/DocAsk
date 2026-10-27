import { ParserDecorator } from './ParserDecorator';
import { EmptyParseError } from '../type';
import type { ParseInput, ParseResult } from '../type';

/** 解析结果为空时抛错 */
export class EmptyGuardDecorator extends ParserDecorator {
  async parse(input: ParseInput): Promise<ParseResult> {
    const result = await this.inner.parse(input);
    if (!result.text?.trim()) {
      throw new EmptyParseError(undefined, result.numpages);
    }
    return result;
  }
}
