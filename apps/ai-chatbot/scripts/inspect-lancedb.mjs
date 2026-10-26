/**
 * 查看本地 LanceDB chunks 表数据。
 *
 * 用法（在 apps/ai-chatbot 下）:
 *   pnpm inspect:lancedb
 *   pnpm inspect:lancedb -- --limit 50
 */

import * as lancedb from '@lancedb/lancedb';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', '.lancedb');
const TABLE = 'chunks';

function parseLimit(argv) {
  const idx = argv.indexOf('--limit');
  if (idx === -1) return 20;
  const n = Number(argv[idx + 1]);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

async function main() {
  const limit = parseLimit(process.argv.slice(2));

  console.log(`LanceDB 路径: ${DB_PATH}`);

  const db = await lancedb.connect(DB_PATH);
  const names = await db.tableNames();
  console.log('表:', names.length ? names.join(', ') : '(空)');

  if (!names.includes(TABLE)) {
    console.log(`\n未找到表 "${TABLE}"。请先 seed 文档写入向量。`);
    process.exit(0);
  }

  const table = await db.openTable(TABLE);
  const count = await table.countRows();
  console.log(`表 "${TABLE}" 行数: ${count}\n`);

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
    .limit(limit)
    .toArray();

  for (const [i, row] of rows.entries()) {
    const full = String(row.snippet ?? '');
    const snippet = full.replace(/\s+/g, ' ').slice(0, 80);
    console.log(
      `${i + 1}. [${row.index}] ${row.title} (${full.length} chars)\n` +
        `   id: ${row.id}\n` +
        `   documentId: ${row.documentId}\n` +
        `   filename: ${row.filename ?? '(n/a)'}  page: ${row.page ?? '(n/a)'}\n` +
        `   snippet: ${snippet}${full.length > 80 ? '…' : ''}\n`,
    );
  }

  if (count > limit) {
    console.log(`… 仅显示前 ${limit} 条，共 ${count} 条。可用 --limit 调整。`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
