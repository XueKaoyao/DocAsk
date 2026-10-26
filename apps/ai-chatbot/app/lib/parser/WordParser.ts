import mammoth from 'mammoth';
import { Parser } from './Parser';
import type { ParseInput, ParseResult } from './type';

/** 仅支持 .docx（OOXML）；旧版 .doc 需另行转换 */
export class WordParser extends Parser {
  supports(filename: string, mime?: string): boolean {
    if (
      mime ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mime === 'application/msword'
    ) {
      return this.extensionOf(filename) !== '.doc';
    }
    const ext = this.extensionOf(filename);
    return ext === '.docx';
  }

  async parse(input: ParseInput): Promise<ParseResult> {
    const ext = this.extensionOf(input.filename);
    if (ext === '.doc') {
      throw new Error('暂不支持旧版 .doc，请先另存为 .docx 后再上传');
    }

    const buffer = Buffer.isBuffer(input.data)
      ? input.data
      : Buffer.from(input.data);

    const { value } = await mammoth.extractRawText({ buffer });
    return {
      text: value.trim(),
      suggestedTitle: this.titleFromFilename(input.filename),
    };
  }
}
