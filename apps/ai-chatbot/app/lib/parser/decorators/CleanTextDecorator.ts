import { ParserDecorator } from './ParserDecorator';
import type { ParseInput, ParseResult } from '../type';

/**
 * 对 text / pages 做通用清洗；若 withPageMarkers 则在清洗后再拼分页标记。
 */
export class CleanTextDecorator extends ParserDecorator {
  async parse(input: ParseInput): Promise<ParseResult> {
    const result = await this.inner.parse(input);
    const pages = result.pages?.map((p) => ({
      ...p,
      text: cleanExtractedText(p.text),
    }));

    let text = cleanExtractedText(result.text);
    if (input.options?.withPageMarkers && pages?.length) {
      text = pages
        .map((p) => `--- Page ${p.num} ---\n${p.text}`)
        .join('\n\n')
        .trim();
    }

    return {
      ...result,
      text,
      pages,
    };
  }
}

function cleanExtractedText(raw: string): string {
  return stripControlChars(raw)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/^[ \t]*-{1,3}\s*\d+\s+of\s+\d+\s*-{1,3}[ \t]*$/gim, '')
    .replace(/^[ \t]*Page\s+\d+\s+of\s+\d+[ \t]*$/gim, '')
    .replace(/^[ \t]*-{2,}\s*Page\s+\d+\s*-{2,}[ \t]*$/gim, '')
    .replace(/^[ \t]*\d+[ \t]*$/gm, '')
    .replace(/[\u2022\u25CF\u25E6\uF0B7]/g, '- ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/([^\n。！？；.!?;:…])\n(?![-•\n])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function stripControlChars(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (
      (c >= 0x00 && c <= 0x08) ||
      c === 0x0b ||
      c === 0x0c ||
      (c >= 0x0e && c <= 0x1f) ||
      c === 0x7f
    ) {
      continue;
    }
    out += text[i];
  }
  return out;
}
