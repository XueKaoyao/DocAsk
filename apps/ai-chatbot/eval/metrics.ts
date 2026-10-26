/**
 * 检索评测指标（文档标题粒度，与 rag-gold relevantTitles 对齐）
 */

export function uniquePreserveOrder(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** 从 top-K hit 标题中取去重文档集合（保持首次出现顺序） */
export function retrievedDocIdsFromTitles(
  hitTitles: string[],
  k: number,
): string[] {
  return uniquePreserveOrder(hitTitles.slice(0, k));
}

/**
 * Recall@K：相关文档中有多少出现在 top-K（按文档标题）。
 * relevant 为空时返回 null（不参与平均）。
 */
export function recallAtK(
  retrievedTitles: string[],
  relevantTitles: string[],
  k: number,
): number | null {
  if (relevantTitles.length === 0) return null;
  const top = new Set(retrievedDocIdsFromTitles(retrievedTitles, k));
  const hit = relevantTitles.filter((t) => top.has(t)).length;
  return hit / relevantTitles.length;
}

/**
 * Precision@K：top-K 返回的文档中相关占比。
 * 分母为 top-K 内去重后的文档数；若为空返回 0。
 * relevant 为空时返回 null（负例不参与平均）。
 */
export function precisionAtK(
  retrievedTitles: string[],
  relevantTitles: string[],
  k: number,
): number | null {
  if (relevantTitles.length === 0) return null;
  const top = retrievedDocIdsFromTitles(retrievedTitles, k);
  if (top.length === 0) return 0;
  const rel = new Set(relevantTitles);
  const hit = top.filter((t) => rel.has(t)).length;
  return hit / top.length;
}

/**
 * Hit@K：top-K 是否命中任一相关文档。
 * relevant 为空时返回 null。
 */
export function hitAtK(
  retrievedTitles: string[],
  relevantTitles: string[],
  k: number,
): number | null {
  if (relevantTitles.length === 0) return null;
  const top = new Set(retrievedDocIdsFromTitles(retrievedTitles, k));
  return relevantTitles.some((t) => top.has(t)) ? 1 : 0;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
