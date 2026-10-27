import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const LOG_ROOT = path.join(process.cwd(), 'logs', 'chat');

export type ChatTranscript = {
  id: string;
  /** JSONL：每行一个事件，便于脚本解析 */
  jsonlPath: string;
  /** 人类可读文本日志 */
  textPath: string;
  append: (event: string, data?: unknown) => Promise<void>;
};

function stamp(): string {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}` +
    `-${pad(d.getMilliseconds(), 3)}`
  );
}

function safeJson(data: unknown): string {
  try {
    return JSON.stringify(
      data,
      (_key, value) => {
        if (typeof value === 'bigint') return value.toString();
        return value;
      },
      2,
    );
  } catch {
    return JSON.stringify({
      error: 'failed to serialize',
      typeof: typeof data,
    });
  }
}

/**
 * 为单次 chat 请求创建日志文件（JSONL + .log）。
 * 目录：logs/chat/
 */
export async function createChatTranscript(meta?: {
  userId?: string;
  model?: string;
}): Promise<ChatTranscript> {
  const id = `${stamp()}-${randomBytes(3).toString('hex')}`;
  await fs.mkdir(LOG_ROOT, { recursive: true });

  const jsonlPath = path.join(LOG_ROOT, `${id}.jsonl`);
  const textPath = path.join(LOG_ROOT, `${id}.log`);

  const header = {
    id,
    startedAt: new Date().toISOString(),
    cwd: process.cwd(),
    ...meta,
  };

  await fs.writeFile(jsonlPath, '', 'utf8');
  await fs.writeFile(
    textPath,
    `# Chat transcript ${id}\n# started ${header.startedAt}\n\n`,
    'utf8',
  );

  async function append(event: string, data?: unknown): Promise<void> {
    const ts = new Date().toISOString();
    const line = JSON.stringify({ ts, event, data }) + '\n';
    const textBlock =
      `---- ${ts} | ${event} ----\n` +
      (data === undefined ? '' : `${safeJson(data)}\n`) +
      '\n';

    await Promise.all([
      fs.appendFile(jsonlPath, line, 'utf8'),
      fs.appendFile(textPath, textBlock, 'utf8'),
    ]);
  }

  await append('session.start', header);
  return { id, jsonlPath, textPath, append };
}

export function chatLogDir(): string {
  return LOG_ROOT;
}
