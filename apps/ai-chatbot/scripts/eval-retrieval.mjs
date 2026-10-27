/**
 * RAG 检索自动评测：对 gold 集逐条调用 /api/retrieval，计算 Recall@K / Precision@K / Hit@K。
 *
 * 用法（apps/ai-chatbot）:
 *   1. 先启动: pnpm dev
 *   2. 再跑:   pnpm eval:retrieval
 *   3. 可选:   pnpm eval:retrieval -- --mode=hybrid --k=5
 *              pnpm eval:retrieval -- --mode=all --k=5
 *              pnpm eval:retrieval -- --base=http://127.0.0.1:3000 --out=eval/reports/latest.json
 *
 * 环境变量:
 *   EVAL_BASE_URL  默认 http://127.0.0.1:3000
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const GOLD_PATH = path.join(APP_ROOT, 'eval/datasets/rag-gold.json');

function uniquePreserveOrder(ids) {
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function retrievedDocIdsFromTitles(hitTitles, k) {
  return uniquePreserveOrder(hitTitles.slice(0, k));
}

function recallAtK(retrievedTitles, relevantTitles, k) {
  if (relevantTitles.length === 0) return null;
  const top = new Set(retrievedDocIdsFromTitles(retrievedTitles, k));
  const hit = relevantTitles.filter((t) => top.has(t)).length;
  return hit / relevantTitles.length;
}

function precisionAtK(retrievedTitles, relevantTitles, k) {
  if (relevantTitles.length === 0) return null;
  const top = retrievedDocIdsFromTitles(retrievedTitles, k);
  if (top.length === 0) return 0;
  const rel = new Set(relevantTitles);
  const hit = top.filter((t) => rel.has(t)).length;
  return hit / top.length;
}

function hitAtK(retrievedTitles, relevantTitles, k) {
  if (relevantTitles.length === 0) return null;
  const top = new Set(retrievedDocIdsFromTitles(retrievedTitles, k));
  return relevantTitles.some((t) => top.has(t)) ? 1 : 0;
}

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

function parseArgs(argv) {
  const opts = {
    base: process.env.EVAL_BASE_URL || 'http://127.0.0.1:3000',
    mode: 'hybrid',
    k: 5,
    out: '',
  };
  for (const arg of argv) {
    if (arg.startsWith('--base=')) opts.base = arg.slice('--base='.length);
    else if (arg.startsWith('--mode=')) opts.mode = arg.slice('--mode='.length);
    else if (arg.startsWith('--k=')) opts.k = Number(arg.slice('--k='.length));
    else if (arg.startsWith('--out=')) opts.out = arg.slice('--out='.length);
  }
  if (!Number.isFinite(opts.k) || opts.k < 1) {
    throw new Error(`invalid --k=${opts.k}`);
  }
  return opts;
}

async function retrieve(base, query, k, mode) {
  const url = `${base.replace(/\/$/, '')}/api/retrieval`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      k,
      mode,
      bypassCache: true,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} ${url}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function evaluateCase(c, hitTitles, k) {
  return {
    id: c.id,
    query: c.query,
    expectInKb: c.expectInKb,
    relevantTitles: c.relevantTitles,
    retrievedTitles: retrievedDocIdsFromTitles(hitTitles, k),
    recall: recallAtK(hitTitles, c.relevantTitles, k),
    precision: precisionAtK(hitTitles, c.relevantTitles, k),
    hit: hitAtK(hitTitles, c.relevantTitles, k),
  };
}

function summarize(rows) {
  const positives = rows.filter((r) => r.recall != null);
  const recalls = positives.map((r) => r.recall);
  const precisions = positives.map((r) => r.precision);
  const hits = positives.map((r) => r.hit);
  return {
    positiveCount: positives.length,
    negativeCount: rows.length - positives.length,
    recallAtK: round4(mean(recalls)),
    precisionAtK: round4(mean(precisions)),
    hitAtK: round4(mean(hits)),
  };
}

function printTable(mode, k, summary, rows) {
  console.log('\n' + '='.repeat(72));
  console.log(`mode=${mode}  K=${k}`);
  console.log('-'.repeat(72));
  console.log(
    `Macro  Recall@${k}=${summary.recallAtK}  Precision@${k}=${summary.precisionAtK}  Hit@${k}=${summary.hitAtK}`,
  );
  console.log(
    `（正例 ${summary.positiveCount} 条参与平均；负例 ${summary.negativeCount} 条仅列出）`,
  );
  console.log('-'.repeat(72));
  console.log(
    `${'id'.padEnd(10)} ${'R'.padStart(6)} ${'P'.padStart(6)} ${'H'.padStart(4)}  query`,
  );
  for (const r of rows) {
    const R = r.recall == null ? '  n/a' : round4(r.recall).toFixed(4);
    const P = r.precision == null ? '  n/a' : round4(r.precision).toFixed(4);
    const H = r.hit == null ? ' n/a' : String(r.hit).padStart(4);
    console.log(
      `${r.id.padEnd(10)} ${R.padStart(6)} ${P.padStart(6)} ${H}  ${r.query}`,
    );
    if (r.hit === 0 || (r.expectInKb && r.recall != null && r.recall < 1)) {
      console.log(
        `           relevant=[${r.relevantTitles.join(', ')}]`,
      );
      console.log(
        `           retrieved=[${r.retrievedTitles.join(', ')}]`,
      );
    }
  }
}

async function runMode(base, cases, mode, k) {
  const rows = [];
  for (const c of cases) {
    process.stdout.write(`  [${mode}] ${c.id} … `);
    try {
      const data = await retrieve(base, c.query, k, mode);
      const hitTitles = (data.results ?? []).map((h) => h.title);
      const row = evaluateCase(c, hitTitles, k);
      rows.push(row);
      const mark =
        row.hit == null ? 'neg' : row.hit === 1 ? 'HIT' : 'MISS';
      console.log(mark);
    } catch (err) {
      console.log('ERR');
      throw err;
    }
  }
  const summary = summarize(rows);
  printTable(mode, k, summary, rows);
  return { mode, k, summary, cases: rows };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const gold = JSON.parse(await fs.readFile(GOLD_PATH, 'utf8'));
  const cases = gold.cases ?? [];
  if (cases.length === 0) {
    throw new Error(`no cases in ${GOLD_PATH}`);
  }

  const modes =
    opts.mode === 'all' ? ['vector', 'bm25', 'hybrid'] : [opts.mode];

  console.log(`Gold: ${GOLD_PATH} (${cases.length} cases)`);
  console.log(`API:  ${opts.base}/api/retrieval`);
  console.log(`Modes: ${modes.join(', ')}  K=${opts.k}`);

  // 探活
  try {
    await retrieve(opts.base, cases[0].query, opts.k, modes[0]);
  } catch (err) {
    console.error('\n无法连接检索 API。请先在本机启动: pnpm dev\n');
    console.error(String(err));
    process.exit(1);
  }

  const reports = [];
  for (const mode of modes) {
    reports.push(await runMode(opts.base, cases, mode, opts.k));
  }

  if (opts.out) {
    const outPath = path.isAbsolute(opts.out)
      ? opts.out
      : path.join(APP_ROOT, opts.out);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(
      outPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          base: opts.base,
          k: opts.k,
          gold: path.relative(APP_ROOT, GOLD_PATH),
          reports,
        },
        null,
        2,
      ),
      'utf8',
    );
    console.log(`\n已写入报告: ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
