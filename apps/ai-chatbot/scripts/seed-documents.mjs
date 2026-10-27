/**
 * 传入本地 Markdown 相对路径，预处理后调用 documents API 写入数据库。
 *
 * 用法（先启动 next dev）:
 *   pnpm seed:docs -- apps/ai-chatbot/app/docs/番茄肉酱意面简易做法.md
 *   pnpm seed:docs -- apps/ai-chatbot/app/docs/如何重置登录密码.md apps/ai-chatbot/app/docs/今日天气与出行建议.md
 *
 * 可选环境变量:
 *   DOCUMENTS_API_URL  默认 http://localhost:3000/api/documents
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** monorepo 根目录（scripts → ai-chatbot → apps → root） */
const REPO_ROOT = path.resolve(__dirname, '../../..');
const APP_ROOT = path.resolve(__dirname, '..');

const DOCUMENTS_API_URL =
  process.env.DOCUMENTS_API_URL ?? 'http://localhost:3000/api/documents';

function parseMarkdown(filePath, raw) {
  const text = raw.replace(/^\uFEFF/, '').trim();
  const headingMatch = text.match(/^#\s+(.+)$/m);
  const title =
    headingMatch?.[1]?.trim() ||
    path.basename(filePath, path.extname(filePath));

  let content = text;
  if (headingMatch) {
    content = text.replace(headingMatch[0], '').trim();
  }
  if (!content) {
    content = text;
  }

  return { title, content };
}

async function loadDocument(inputPath) {
  const candidates = [
    path.resolve(process.cwd(), inputPath),
    path.resolve(REPO_ROOT, inputPath),
    path.resolve(APP_ROOT, inputPath),
    path.resolve(APP_ROOT, inputPath.replace(/^apps[/\\]ai-chatbot[/\\]/i, '')),
  ];

  let lastError;
  for (const filePath of candidates) {
    try {
      const raw = await readFile(filePath, 'utf8');
      const { title, content } = parseMarkdown(filePath, raw);
      const filename = path.basename(filePath);
      return { title, content, filename, source: inputPath, resolved: filePath };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `无法读取文档: ${inputPath}${lastError instanceof Error ? ` (${lastError.message})` : ''}`,
  );
}

async function main() {
  const inputs = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));

  if (inputs.length === 0) {
    console.error('用法: pnpm seed:docs -- <本地md相对路径> [更多路径...]');
    console.error(
      '示例: pnpm seed:docs -- apps/ai-chatbot/app/docs/番茄肉酱意面简易做法.md',
    );
    process.exit(1);
  }

  const documents = [];
  for (const input of inputs) {
    const doc = await loadDocument(input);
    documents.push(doc);
    console.log(`已解析: [${doc.source}] → ${doc.title}`);
  }

  const body =
    documents.length === 1
      ? {
          title: documents[0].title,
          content: documents[0].content,
          filename: documents[0].filename,
        }
      : {
          documents: documents.map(({ title, content, filename }) => ({
            title,
            content,
            filename,
          })),
        };

  console.log(`\n写入接口: ${DOCUMENTS_API_URL}`);

  let response;
  try {
    response = await fetch(DOCUMENTS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error(
      '\n请求失败，请确认 Next.js 已启动:\n',
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(`\n写入失败 HTTP ${response.status}:`, payload);
    process.exit(1);
  }

  if (payload.document) {
    console.log(
      `\n写入成功: ${payload.document.id}  ${payload.document.title}`,
    );
  } else {
    console.log(`\n写入成功: ${payload.count ?? documents.length} 条`);
    for (const doc of payload.documents ?? []) {
      console.log(`  ✓ ${doc.id}  ${doc.title}`);
    }
  }
}

main();
