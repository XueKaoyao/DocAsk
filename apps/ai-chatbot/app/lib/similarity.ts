import { CandidateResult } from '../types/RetrievalType';

/** 余弦相似度，返回 [-1, 1]，越接近 1 越相似 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`向量维度不一致: ${a.length} vs ${b.length}`);
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;

  return dot / denom;
}

/**
 * 若 embedding 已 L2 归一化（normalize: true），
 * 余弦相似度 = 点积，更快
 */
export function cosineSimilarityNormalized(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

export type ChunkDocumentOptions = {
  /** 单块最大字符数，默认 500（偏 RAG 检索粒度） */
  maxChars?: number;
  /** 相邻块重叠字符数，默认 100；须 < maxChars */
  overlap?: number;
  /**
   * 递归分隔符，从粗到细。
   * 默认在 LangChain `["\\n\\n","\\n"," ",""]` 基础上加入中英文句读，
   * 避免中文被硬拆到字符级。
   */
  separators?: string[];
};

export type DocumentChunk = {
  id: string;
  documentId: string;
  text: string;
};

/** 默认分隔符：段落 → 行 → 中/英文句子 → 逗号 → 空格 → 字符 */
export const DEFAULT_CHUNK_SEPARATORS = [
  '\n\n',
  '\n',
  '。',
  '！',
  '？',
  '；',
  '.',
  '!',
  '?',
  ';',
  '，',
  ',',
  ' ',
  '',
] as const;

const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_CHUNK_OVERLAP = 100;

function escapeRegExp(value: string): string {
  return value.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}

/** 对齐 LangChain TextSplitter.splitOnSeparator（keepSeparator = true） */
function splitOnSeparator(text: string, separator: string): string[] {
  let splits: string[];
  if (separator) {
    // 保留分隔符在后一段开头：'a\nb' → ['a', '\nb']
    splits = text.split(new RegExp(`(?=${escapeRegExp(separator)})`));
  } else {
    splits = text.split('');
  }
  return splits.filter((s) => s !== '');
}

function joinDocs(docs: string[], separator: string): string | null {
  const text = docs.join(separator).trim();
  return text === '' ? null : text;
}

/**
 * 对齐 LangChain TextSplitter.mergeSplits：
 * 把小片段合并到不超过 chunkSize，并保留 overlap。
 */
function mergeSplits(
  splits: string[],
  separator: string,
  chunkSize: number,
  chunkOverlap: number,
): string[] {
  const docs: string[] = [];
  const currentDoc: string[] = [];
  let total = 0;

  for (const d of splits) {
    const len = d.length;
    if (total + len + currentDoc.length * separator.length > chunkSize) {
      if (currentDoc.length > 0) {
        const doc = joinDocs(currentDoc, separator);
        if (doc !== null) docs.push(doc);

        while (
          total > chunkOverlap ||
          (total + len + currentDoc.length * separator.length > chunkSize &&
            total > 0)
        ) {
          total -= currentDoc[0].length;
          currentDoc.shift();
        }
      }
    }
    currentDoc.push(d);
    total += len;
  }

  const doc = joinDocs(currentDoc, separator);
  if (doc !== null) docs.push(doc);
  return docs;
}

/**
 * 对齐 LangChain RecursiveCharacterTextSplitter._splitText：
 * 按分隔符优先级递归切分，超长片段再用更细的分隔符。
 */
export function recursiveCharacterSplit(
  text: string,
  chunkSize: number,
  chunkOverlap: number,
  separators: string[],
): string[] {
  const finalChunks: string[] = [];

  let separator = separators[separators.length - 1] ?? '';
  let newSeparators: string[] | undefined;

  for (let i = 0; i < separators.length; i++) {
    const s = separators[i];
    if (s === '') {
      separator = s;
      break;
    }
    if (text.includes(s)) {
      separator = s;
      newSeparators = separators.slice(i + 1);
      break;
    }
  }

  const splits = splitOnSeparator(text, separator);
  // keepSeparator=true 时分隔符已留在片段内，合并时不再插入 separator
  const mergeSeparator = '';
  let goodSplits: string[] = [];

  for (const s of splits) {
    if (s.length < chunkSize) {
      goodSplits.push(s);
    } else {
      if (goodSplits.length) {
        finalChunks.push(
          ...mergeSplits(goodSplits, mergeSeparator, chunkSize, chunkOverlap),
        );
        goodSplits = [];
      }
      if (!newSeparators) {
        finalChunks.push(s);
      } else {
        finalChunks.push(
          ...recursiveCharacterSplit(s, chunkSize, chunkOverlap, newSeparators),
        );
      }
    }
  }

  if (goodSplits.length) {
    finalChunks.push(
      ...mergeSplits(goodSplits, mergeSeparator, chunkSize, chunkOverlap),
    );
  }

  return finalChunks;
}

function normalizeContent(content: string): string {
  return content
    .replace(/\\r\\n/g, '\r\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

/**
 * 递归字符分块（LangChain RecursiveCharacterTextSplitter）。
 * 优先在段落/句子边界切开，必要时再落到词或字符级，并保留 overlap。
 */
export function chunkDocument(
  content: string,
  documentId: string,
  options: ChunkDocumentOptions = {},
): DocumentChunk[] {
  const maxChars = options.maxChars ?? DEFAULT_CHUNK_SIZE;
  const overlap = options.overlap ?? DEFAULT_CHUNK_OVERLAP;
  const separators = options.separators ?? [...DEFAULT_CHUNK_SEPARATORS];

  if (!Number.isFinite(maxChars) || maxChars < 1) {
    throw new Error('maxChars must be a positive number');
  }
  if (!Number.isFinite(overlap) || overlap < 0) {
    throw new Error('overlap must be a non-negative number');
  }
  if (overlap >= maxChars) {
    throw new Error('Cannot have overlap >= maxChars');
  }

  const normalized = normalizeContent(content).trim();
  if (!normalized) return [];

  return recursiveCharacterSplit(normalized, maxChars, overlap, separators).map(
    (text, i) => ({
      id: `${documentId}#${i}`,
      documentId,
      text,
    }),
  );
}

/** 在候选库中找最相似的 Top-K */
export function topKSimilar(
  query: number[],
  candidates: { id: string; embedding: number[] }[],
  k = 5,
): CandidateResult[] {
  return candidates
    .map((c) => ({
      id: c.id,
      score: cosineSimilarityNormalized(query, c.embedding),
    }))
    .sort((x, y) => y.score - x.score)
    .slice(0, k);
}
