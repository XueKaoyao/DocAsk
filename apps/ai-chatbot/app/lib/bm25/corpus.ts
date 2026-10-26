import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { LanceChunkRow } from '@/app/lib/lancedb';

export type Bm25Doc = {
  snippet: string;
  title: string;
  documentId: string;
  filename: string;
  page: number;
  index: number;
};

const CORPUS_PATH = path.join(process.cwd(), '.bm25-corpus.json');

type Store = Record<string, Bm25Doc>;

let docs = new Map<string, Bm25Doc>();
let loaded = false;

export function corpusPath(): string {
  return CORPUS_PATH;
}

export function rowToBm25Doc(row: LanceChunkRow): Bm25Doc {
  return {
    snippet: row.snippet,
    title: row.title,
    documentId: row.documentId,
    filename: row.filename,
    page: row.page,
    index: row.index,
  };
}

export async function loadCorpus(): Promise<void> {
  if (loaded) return;
  try {
    const raw = await fs.readFile(CORPUS_PATH, 'utf8');
    const data = JSON.parse(raw) as Store;
    docs = new Map(Object.entries(data));
  } catch {
    docs = new Map();
  }
  loaded = true;
}

export async function saveCorpus(): Promise<void> {
  await loadCorpus();
  const obj: Store = Object.fromEntries(docs);
  await fs.writeFile(CORPUS_PATH, JSON.stringify(obj), 'utf8');
}

export async function upsertCorpus(rows: LanceChunkRow[]): Promise<void> {
  if (rows.length === 0) return;
  await loadCorpus();
  for (const row of rows) {
    docs.set(row.id, rowToBm25Doc(row));
  }
  await saveCorpus();
}

export async function removeCorpusByDocumentId(
  documentId: string,
): Promise<void> {
  await loadCorpus();
  for (const [id, doc] of [...docs.entries()]) {
    if (doc.documentId === documentId) {
      docs.delete(id);
    }
  }
  await saveCorpus();
}

export async function clearCorpus(): Promise<void> {
  docs = new Map();
  loaded = true;
  await saveCorpus();
}

export async function replaceCorpus(
  entries: Array<{ id: string; doc: Bm25Doc }>,
): Promise<void> {
  docs = new Map(entries.map((e) => [e.id, e.doc]));
  loaded = true;
  await saveCorpus();
}

export async function getAllCorpusEntries(): Promise<
  Array<{ id: string; doc: Bm25Doc }>
> {
  await loadCorpus();
  return [...docs.entries()].map(([id, doc]) => ({ id, doc }));
}

export async function getCorpusDoc(id: string): Promise<Bm25Doc | undefined> {
  await loadCorpus();
  return docs.get(id);
}

export async function getCorpusSize(): Promise<number> {
  await loadCorpus();
  return docs.size;
}
