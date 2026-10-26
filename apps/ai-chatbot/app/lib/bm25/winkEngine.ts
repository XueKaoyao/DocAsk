import bm25 from 'wink-bm25-text-search';
import type { WinkBm25Engine, WinkOvFields } from 'wink-bm25-text-search';
import { getAllCorpusEntries, loadCorpus } from './corpus';
import { prepTask } from './prepTask';

const FLD_WEIGHTS = { snippet: 2, title: 1 } as const;
const OV_FIELDS = [
  'snippet',
  'title',
  'documentId',
  'filename',
  'page',
  'index',
] as const;

type GlobalBm25 = typeof globalThis & {
  __bm25Engine?: WinkBm25Engine | null;
  __bm25Ready?: boolean;
  __bm25RebuildTimer?: ReturnType<typeof setTimeout> | null;
  __bm25RebuildPromise?: Promise<void> | null;
};

function g(): GlobalBm25 {
  return globalThis as GlobalBm25;
}

function createConfiguredEngine(): WinkBm25Engine {
  const engine = bm25();
  engine.defineConfig({
    fldWeights: { ...FLD_WEIGHTS },
    bm25Params: { k1: 1.2, b: 0.75, k: 1 },
    ovFldNames: [...OV_FIELDS],
  });
  engine.definePrepTasks([prepTask]);
  return engine;
}

/** 从 corpus 全量重建 wink 引擎（consolidate 后不可再 addDoc） */
export async function rebuildEngine(): Promise<void> {
  await loadCorpus();
  const entries = await getAllCorpusEntries();
  const engine = createConfiguredEngine();

  for (const { id, doc } of entries) {
    engine.addDoc(
      {
        snippet: doc.snippet,
        title: doc.title,
        documentId: doc.documentId,
        filename: doc.filename,
        page: doc.page,
        index: doc.index,
      },
      id,
    );
  }

  if (entries.length > 0) {
    engine.consolidate();
  }

  g().__bm25Engine = engine;
  g().__bm25Ready = entries.length > 0;
}

export function scheduleRebuild(delayMs = 300): void {
  const state = g();
  if (state.__bm25RebuildTimer) {
    clearTimeout(state.__bm25RebuildTimer);
  }
  state.__bm25RebuildTimer = setTimeout(() => {
    state.__bm25RebuildTimer = null;
    state.__bm25RebuildPromise = rebuildEngine()
      .catch((err) => {
        console.error('[bm25] rebuild failed:', err);
      })
      .finally(() => {
        state.__bm25RebuildPromise = null;
      });
  }, delayMs);
}

export async function flushRebuild(): Promise<void> {
  const state = g();
  if (state.__bm25RebuildTimer) {
    clearTimeout(state.__bm25RebuildTimer);
    state.__bm25RebuildTimer = null;
  }
  if (state.__bm25RebuildPromise) {
    await state.__bm25RebuildPromise;
  }
  await rebuildEngine();
}

export async function ensureEngine(): Promise<WinkBm25Engine | null> {
  await loadCorpus();
  const state = g();
  if (state.__bm25RebuildPromise) {
    await state.__bm25RebuildPromise;
  }
  if (!state.__bm25Engine || state.__bm25Ready === undefined) {
    await rebuildEngine();
  }
  if (!g().__bm25Ready) {
    return null;
  }
  return g().__bm25Engine ?? null;
}

export type Bm25SearchPair = {
  id: string;
  score: number;
  fields: WinkOvFields;
};

export type Bm25Vocabulary = {
  /** token → termId */
  tokens: Record<string, number>;
  /** 词表（按 token 排序，便于查看） */
  terms: string[];
  termCount: number;
  totalDocs: number;
  totalCorpusLength: number;
};

/** 读取 consolidate 后的词典；无索引时返回空词表 */
export async function getVocabulary(): Promise<Bm25Vocabulary> {
  const engine = await ensureEngine();
  if (!engine) {
    return {
      tokens: {},
      terms: [],
      termCount: 0,
      totalDocs: 0,
      totalCorpusLength: 0,
    };
  }

  const tokens = engine.getTokens() ?? {};
  const terms = Object.keys(tokens).sort((a, b) => a.localeCompare(b, 'zh'));
  return {
    tokens,
    terms,
    termCount: terms.length,
    totalDocs: engine.getTotalDocs(),
    totalCorpusLength: engine.getTotalCorpusLength(),
  };
}

export type InvertedIndexEntry = {
  term: string;
  /** 包含该词的 chunk 数（document frequency） */
  df: number;
  chunkIds: string[];
};

export type Bm25InvertedIndex = {
  termCount: number;
  chunkCount: number;
  /** term → 出现该词的 chunkId 列表（去重、稳定排序） */
  inverted: Record<string, string[]>;
  /** 按 term 排序，便于浏览 */
  entries: InvertedIndexEntry[];
};

/**
 * 倒排表：词 → chunkId[]。
 * wink 不暴露内部倒排，这里用与引擎相同的 prepTask 从 corpus 重建。
 */
export async function getInvertedIndex(): Promise<Bm25InvertedIndex> {
  await loadCorpus();
  const entries = await getAllCorpusEntries();
  const map = new Map<string, Set<string>>();

  for (const { id, doc } of entries) {
    // 与 fldWeights 一致：snippet + title 都会进索引
    const tokens = [...prepTask(doc.snippet), ...prepTask(doc.title)];
    for (const term of tokens) {
      let set = map.get(term);
      if (!set) {
        set = new Set();
        map.set(term, set);
      }
      set.add(id);
    }
  }

  const inverted: Record<string, string[]> = {};
  const list: InvertedIndexEntry[] = [];
  const terms = [...map.keys()].sort((a, b) => a.localeCompare(b, 'zh'));
  for (const term of terms) {
    const chunkIds = [...(map.get(term) ?? [])].sort();
    inverted[term] = chunkIds;
    list.push({ term, df: chunkIds.length, chunkIds });
  }

  return {
    termCount: terms.length,
    chunkCount: entries.length,
    inverted,
    entries: list,
  };
}

export async function searchEngine(
  query: string,
  limit: number,
  docId?: string,
): Promise<Bm25SearchPair[]> {
  const engine = await ensureEngine();
  if (!engine) return [];

  const trimmed = query.trim();
  if (!trimmed || limit < 1) return [];

  // 有 docId 时多取一些再滤，避免过滤后不足 k
  const fetchLimit = docId ? Math.max(limit * 5, limit * 2) : limit;

  const raw = engine.search(
    trimmed,
    fetchLimit,
    (ov, params) => {
      const want = (params as { docId?: string } | undefined)?.docId;
      if (!want) return true;
      return String(ov.documentId ?? '') === want;
    },
    { docId },
  );

  return raw.slice(0, limit).map(([id, score]) => {
    const sid = String(id);
    // wink filter 路径下 ov 字段在内部；用 corpus 回填更稳
    return { id: sid, score: Number(score) || 0, fields: {} };
  });
}
