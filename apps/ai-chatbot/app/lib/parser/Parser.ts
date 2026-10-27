import type { ParseInput, ParseResult } from './type';

/**
 * 解析器抽象基类：策略与装饰器共同继承。
 * 不含具体格式逻辑；按扩展名选择实例见 ParserFactory.create。
 */
export abstract class Parser {
  /** 是否支持该文件（扩展名 / mime） */
  abstract supports(filename: string, mime?: string): boolean;

  /** 将文件内容解析为可入库文本 */
  abstract parse(input: ParseInput): Promise<ParseResult>;

  /** 取小写扩展名，如 ".pdf"；无扩展名则 "" */
  protected extensionOf(filename: string): string {
    const base = filename.split(/[/\\]/).pop() ?? filename;
    const dot = base.lastIndexOf('.');
    return dot >= 0 ? base.slice(dot).toLowerCase() : '';
  }

  protected decodeUtf8(data: Buffer | Uint8Array): string {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    return buf.toString('utf8').replace(/^\uFEFF/, '');
  }

  protected titleFromFilename(filename: string): string {
    const base = filename.split(/[/\\]/).pop() ?? filename;
    const dot = base.lastIndexOf('.');
    const name = dot >= 0 ? base.slice(0, dot) : base;
    return name.trim() || base;
  }
}
