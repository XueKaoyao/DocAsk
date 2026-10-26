/**
 * 监视 logs/chat 下最新的 chat 日志，把新增内容打到终端。
 *
 * 用法（在 apps/ai-chatbot 下）：
 *   pnpm chat:logs
 *   node scripts/watch-chat-logs.mjs
 *   node scripts/watch-chat-logs.mjs --file logs/chat/xxx.log
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { watch } from 'node:fs';

const ROOT = process.cwd();
const LOG_DIR = path.join(ROOT, 'logs', 'chat');

function parseArgs(argv) {
  const out = { file: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--file' && argv[i + 1]) {
      out.file = path.resolve(ROOT, argv[++i]);
    }
  }
  return out;
}

async function ensureDir() {
  await fs.mkdir(LOG_DIR, { recursive: true });
}

async function latestLogFile() {
  const names = await fs.readdir(LOG_DIR);
  const logs = names.filter((n) => n.endsWith('.log'));
  if (logs.length === 0) return null;
  const stats = await Promise.all(
    logs.map(async (name) => {
      const p = path.join(LOG_DIR, name);
      const st = await fs.stat(p);
      return { p, mtime: st.mtimeMs };
    }),
  );
  stats.sort((a, b) => b.mtime - a.mtime);
  return stats[0]?.p ?? null;
}

async function tailFile(filePath) {
  let offset = 0;
  try {
    const st = await fs.stat(filePath);
    // 先打印已有全文，再跟新增
    const existing = await fs.readFile(filePath, 'utf8');
    process.stdout.write(existing);
    offset = st.size;
  } catch {
    offset = 0;
  }

  const watcher = watch(filePath, async (event) => {
    if (event !== 'change' && event !== 'rename') return;
    try {
      const st = await fs.stat(filePath);
      if (st.size < offset) offset = 0;
      if (st.size === offset) return;
      const fh = await fs.open(filePath, 'r');
      try {
        const len = st.size - offset;
        const buf = Buffer.alloc(len);
        await fh.read(buf, 0, len, offset);
        offset = st.size;
        process.stdout.write(buf.toString('utf8'));
      } finally {
        await fh.close();
      }
    } catch (err) {
      console.error('[chat:logs] read failed:', err);
    }
  });

  console.error(`\n[chat:logs] watching ${filePath} (Ctrl+C 退出)\n`);
  process.on('SIGINT', () => {
    watcher.close();
    process.exit(0);
  });
}

async function main() {
  await ensureDir();
  const args = parseArgs(process.argv);
  let target = args.file;

  if (!target) {
    target = await latestLogFile();
    if (!target) {
      console.error(`[chat:logs] 尚无日志。目录：${LOG_DIR}`);
      console.error('先在网页发起一次 chat，或指定 --file <path>');
      // 监视目录，等新文件出现
      const dirWatcher = watch(LOG_DIR, async (_event, filename) => {
        if (!filename || !filename.endsWith('.log')) return;
        dirWatcher.close();
        const p = path.join(LOG_DIR, filename);
        console.error(`[chat:logs] 发现新日志 ${p}`);
        await tailFile(p);
      });
      console.error('[chat:logs] 等待新的 .log 文件…');
      return;
    }
  }

  await tailFile(target);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
