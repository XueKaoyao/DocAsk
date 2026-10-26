export type ParseInput = {
  data: Buffer | Uint8Array;
  filename: string;
  /** 可选：调试分页标记等 */
  options?: {
    withPageMarkers?: boolean;
  };
};

export type ParsePage = { num: number; text: string };

export type ParseResult = {
  text: string; // → Document.content
  pages?: ParsePage[]; // PDF 有；md/txt 可省略
  numpages?: number;
  /** 建议标题（去扩展名），API 可再被 form 覆盖 */
  suggestedTitle?: string;
};

export class UnsupportedFileTypeError extends Error {
  readonly filename: string;

  constructor(filename: string) {
    super(`不支持的文件类型: ${filename}`);
    this.name = 'UnsupportedFileTypeError';
    this.filename = filename;
  }
}

export class EmptyParseError extends Error {
  readonly numpages?: number;

  constructor(message?: string, numpages?: number) {
    super(
      message ??
        '未能从文件提取到文字，可能是空文件、扫描件或纯图片（当前不支持 OCR）',
    );
    this.name = 'EmptyParseError';
    this.numpages = numpages;
  }
}
