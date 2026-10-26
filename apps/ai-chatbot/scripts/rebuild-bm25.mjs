/**
 * 从 LanceDB chunks 表重建 BM25 旁路语料并 consolidate 引擎。
 *
 * 用法（在 apps/ai-chatbot 下）:
 *   pnpm rebuild:bm25
 */

import * as lancedb from '@lancedb/lancedb';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.join(APP_ROOT, '.lancedb');
const TABLE = 'chunks';
const CORPUS_PATH = path.join(APP_ROOT, '.bm25-corpus.json');

const require = createRequire(import.meta.url);

async function main() {
  process.chdir(APP_ROOT);
  console.log(`LanceDB: ${DB_PATH}`);
  console.log(`Corpus:  ${CORPUS_PATH}`);

  const db = await lancedb.connect(DB_PATH);
  const names = await db.tableNames();
  if (!names.includes(TABLE)) {
    console.log(`未找到表 "${TABLE}"，将写入空语料。`);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(CORPUS_PATH, '{}', 'utf8');
    console.log('已写入空 .bm25-corpus.json');
    process.exit(0);
  }

  const table = await db.openTable(TABLE);
  const count = await table.countRows();
  console.log(`读取 "${TABLE}" 共 ${count} 行…`);

  const rows = await table
    .query()
    .select([
      'id',
      'documentId',
      'title',
      'filename',
      'page',
      'snippet',
      'index',
    ])
    .toArray();

  const store = {};
  for (const row of rows) {
    const id = String(row.id);
    store[id] = {
      snippet: String(row.snippet ?? ''),
      title: String(row.title ?? ''),
      documentId: String(row.documentId ?? ''),
      filename: String(row.filename ?? ''),
      page: Number(row.page ?? 0),
      index: Number(row.index ?? 0),
    };
  }

  const { writeFile } = await import('node:fs/promises');
  await writeFile(CORPUS_PATH, JSON.stringify(store), 'utf8');
  console.log(`已写入语料 ${Object.keys(store).length} 条 → ${CORPUS_PATH}`);

  // 用 wink 验证可 consolidate（与运行时 prepTask 对齐的简化 token）
  const bm25 = require('wink-bm25-text-search');
  const engine = bm25();
  engine.defineConfig({
    fldWeights: { snippet: 2, title: 1 },
    bm25Params: { k1: 1.2, b: 0.75, k: 1 },
    ovFldNames: [
      'snippet',
      'title',
      'documentId',
      'filename',
      'page',
      'index',
    ],
  });
  engine.definePrepTasks([
    (text) =>
      String(text)
        .toLowerCase()
        .match(/[a-z0-9_\u4e00-\u9fff]+/g) ?? [],
  ]);

  for (const [id, doc] of Object.entries(store)) {
    engine.addDoc(doc, id);
  }
  if (Object.keys(store).length > 0) {
    engine.consolidate();
    console.log(`wink consolidate 完成，docs=${engine.getTotalDocs()}`);
  } else {
    console.log('语料为空，跳过 consolidate');
  }

  console.log('完成。下次 POST /api/bm25 将 load 语料并 rebuild 引擎。');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
