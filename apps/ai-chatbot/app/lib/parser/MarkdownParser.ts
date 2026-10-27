import { Parser } from './Parser';
import type { ParseInput, ParseResult } from './type';

export class MarkdownParser extends Parser {
  supports(filename: string, mime?: string): boolean {
    if (mime === 'text/markdown' || mime === 'text/x-markdown') return true;
    const ext = this.extensionOf(filename);
    return ext === '.md' || ext === '.markdown';
  }

  async parse(input: ParseInput): Promise<ParseResult> {
    const raw = this.decodeUtf8(input.data).trim();
    const headingMatch = raw.match(/^#\s+(.+)$/m);
    const suggestedTitle =
      headingMatch?.[1]?.trim() || this.titleFromFilename(input.filename);

    let text = raw;
    if (headingMatch) {
      text = raw.replace(headingMatch[0], '').trim() || raw;
    }

    return {
      text,
      suggestedTitle,
    };
  }
}
