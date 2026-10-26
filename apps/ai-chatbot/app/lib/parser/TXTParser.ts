import { Parser } from './Parser';
import type { ParseInput, ParseResult } from './type';

export class TXTParser extends Parser {
  supports(filename: string, mime?: string): boolean {
    if (mime === 'text/plain') return true;
    const ext = this.extensionOf(filename);
    return ext === '.txt' || ext === '.text';
  }

  async parse(input: ParseInput): Promise<ParseResult> {
    const text = this.decodeUtf8(input.data).trim();
    return {
      text,
      suggestedTitle: this.titleFromFilename(input.filename),
    };
  }
}
