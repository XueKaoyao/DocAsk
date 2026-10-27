import { readFile } from 'fs/promises';
import path from 'path';
import { PDFParse } from 'pdf-parse';

export type ExtractPdfOptions = {
  /** 为 true 时按页拼接并插入分页标记，便于调试 */
  withPageMarkers?: boolean;
  /** 自定义 PDF 路径；默认 app/docs/test.pdf */
  filePath?: string;
  /** 直接传入文件内容（上传场景）；优先于 filePath */
  data?: Buffer | Uint8Array;
};

export type ExtractPdfResult = {
  text: string;
  numpages: number;
  /** 清洗后的各页文本（未加分页标记） */
  pages: Array<{ num: number; text: string }>;
};

/** 去掉 C0 控制符（保留 \t \n \r）与 DEL，避免 PDF 提取噪声 */
function stripPdfControlChars(text: string): string {
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

/** 去掉控制字符、页眉页脚噪声，并折叠多余空白 */
export function cleanPdfText(raw: string): string {
  return (
    stripPdfControlChars(raw)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // PDF 常见页脚：-- 2 of 4 -- / - 2 of 4 - / Page 2 of 4
      .replace(/^[ \t]*-{1,3}\s*\d+\s+of\s+\d+\s*-{1,3}[ \t]*$/gim, '')
      .replace(/^[ \t]*Page\s+\d+\s+of\s+\d+[ \t]*$/gim, '')
      // 调试标记：--- Page N ---
      .replace(/^[ \t]*-{2,}\s*Page\s+\d+\s*-{2,}[ \t]*$/gim, '')
      // 孤立页码行
      .replace(/^[ \t]*\d+[ \t]*$/gm, '')
      // 私用区列表符等 → 统一为 "- "
      .replace(/[\u2022\u25CF\u25E6\uF0B7]/g, '- ')
      .replace(/[ \t]+\n/g, '\n')
      // PDF 软换行：上一行未以句读结束时拼回同一段，便于按。！？切块
      .replace(/([^\n。！？；.!?;:…])\n(?![-•\n])/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
  );
}

export class EmptyPdfTextError extends Error {
  readonly numpages: number;

  constructor(numpages: number) {
    super('未能从 PDF 提取到文字，可能是扫描件或纯图片 PDF（当前不支持 OCR）');
    this.name = 'EmptyPdfTextError';
    this.numpages = numpages;
  }
}

export async function extractTextFromPdf(
  options: ExtractPdfOptions = {},
): Promise<ExtractPdfResult> {
  const data =
    options.data ??
    (await readFile(
      options.filePath ?? path.join(process.cwd(), 'app', 'docs', 'test.pdf'),
    ));

  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    const pages = result.pages.map((p) => ({
      num: p.num,
      text: cleanPdfText(p.text),
    }));

    const text = options.withPageMarkers
      ? pages
          .map((p) => `--- Page ${p.num} ---\n${p.text}`)
          .join('\n\n')
          .trim()
      : cleanPdfText(result.text);

    if (!text) {
      throw new EmptyPdfTextError(result.total);
    }

    return {
      text,
      numpages: result.total,
      pages,
    };
  } finally {
    await parser.destroy();
  }
}
