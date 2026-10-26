import { Parser } from './Parser';
import type { ParseInput, ParseResult } from './type';

/** 将 CSV 转为可读纯文本，便于切块与检索 */
export class CSVParser extends Parser {
  supports(filename: string, mime?: string): boolean {
    if (mime === 'text/csv' || mime === 'application/csv') return true;
    return this.extensionOf(filename) === '.csv';
  }

  async parse(input: ParseInput): Promise<ParseResult> {
    const raw = this.decodeUtf8(input.data).trim();
    const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length === 0) {
      return {
        text: '',
        suggestedTitle: this.titleFromFilename(input.filename),
      };
    }

    const rows = lines.map((line) => this.parseCsvLine(line));
    const header = rows[0] ?? [];
    const body = rows.slice(1);

    const textParts: string[] = [];
    if (header.length > 0) {
      textParts.push(`表头: ${header.join(' | ')}`);
    }
    for (let i = 0; i < body.length; i++) {
      const row = body[i];
      if (header.length > 0 && header.length === row.length) {
        const cells = header.map((h, j) => `${h}: ${row[j] ?? ''}`);
        textParts.push(`第 ${i + 1} 行: ${cells.join('；')}`);
      } else {
        textParts.push(`第 ${i + 1} 行: ${row.join(' | ')}`);
      }
    }

    return {
      text: textParts.join('\n'),
      suggestedTitle: this.titleFromFilename(input.filename),
    };
  }

  /** 简易 CSV 行解析（支持双引号包裹与转义 ""） */
  private parseCsvLine(line: string): string[] {
    const cells: string[] = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        cells.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    return cells;
  }
}
