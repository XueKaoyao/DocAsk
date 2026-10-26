import { readFile } from 'fs/promises';
import path from 'path';
import { createDocument } from '@/app/lib/documents';
import {
  EmptyParseError,
  ParserFactory,
  UnsupportedFileTypeError,
} from '@/app/lib/parser';
import { NextResponse } from 'next/server';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB（原 MAX_PDF_BYTES）
const DEFAULT_PDF = path.join(process.cwd(), 'app', 'docs', 'test.pdf');

/** GET /api/pdf — 调试：读取本地 test.pdf */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const withPageMarkers = searchParams.get('pages') === '1';
    const filename = 'test.pdf';
    const data = await readFile(DEFAULT_PDF);
    const result = await ParserFactory.create(filename).parse({
      data,
      filename,
      options: { withPageMarkers },
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof EmptyParseError) {
      return NextResponse.json(
        { error: error.message, numpages: error.numpages },
        { status: 422 },
      );
    }
    const message =
      error instanceof Error ? error.message : 'Failed to extract PDF text';
    console.error('GET /api/pdf:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/file — 上传文件，按后缀经 ParserFactory 选择解析器，写入 Document + LanceDB
 * 支持：.pdf / .md / .markdown / .txt / .csv / .docx
 * multipart/form-data: file（必填）, title（可选）
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json(
        // { error: '请上传 PDF 文件（字段名 file）' },
        { error: '请上传文件（字段名 file）' },
        { status: 400 },
      );
    }

    // --- 旧逻辑：仅允许 PDF ---
    // const name = file.name.toLowerCase();
    // const isPdf =
    //   file.type === 'application/pdf' ||
    //   file.type === 'application/x-pdf' ||
    //   name.endsWith('.pdf');
    // if (!isPdf) {
    //   return NextResponse.json({ error: '仅支持 PDF 文件' }, { status: 400 });
    // }

    if (file.size <= 0) {
      return NextResponse.json({ error: '文件为空' }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        // { error: `文件过大，上限 ${MAX_PDF_BYTES / (1024 * 1024)}MB` },
        { error: `文件过大，上限 ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB` },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    // const filename = file.name.trim() || 'upload.pdf';
    const filename = file.name.trim() || 'upload.bin';

    // --- 旧逻辑：直接 new PDFParser / 或仅按 PDF 解析 ---
    // const extracted = await new PDFParser().parse({ data: buffer, filename });
    // 新逻辑：按后缀在全部策略中选择（PDF / Markdown / TXT / CSV / Word）
    const extracted = await ParserFactory.create(filename, file.type).parse({
      data: buffer,
      filename,
    });

    const titleField = form.get('title');
    const titleFromForm =
      typeof titleField === 'string' ? titleField.trim() : '';
    // const title =
    //   titleFromForm ||
    //   extracted.suggestedTitle ||
    //   filename.replace(/\.pdf$/i, '').trim() ||
    //   '未命名 PDF';
    const title =
      titleFromForm ||
      extracted.suggestedTitle ||
      filename.replace(/\.[^.]+$/i, '').trim() ||
      '未命名文档';

    // 按页入库：Document 存全文；LanceDB 用 pages 按页切块并写入真实 page（无 pages 则全文切块）
    const document = await createDocument({
      title,
      filename,
      content: extracted.text,
      pages: extracted.pages,
    });

    return NextResponse.json(
      {
        document,
        numpages: extracted.numpages,
        chars: extracted.text.length,
        pageCount: extracted.pages?.length ?? 0,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof UnsupportedFileTypeError) {
      return NextResponse.json(
        {
          error: `${error.message}（支持 .pdf / .md / .txt / .csv / .docx）`,
        },
        { status: 400 },
      );
    }
    if (error instanceof EmptyParseError) {
      return NextResponse.json(
        { error: error.message, numpages: error.numpages },
        { status: 422 },
      );
    }
    // const message =
    //   error instanceof Error ? error.message : 'Failed to upload PDF';
    const message =
      error instanceof Error ? error.message : 'Failed to upload file';
    console.error('POST /api/file:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
