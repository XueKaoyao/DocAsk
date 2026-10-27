export type RankedList = {
  name: string;
  /** 已按相关性降序的 chunk id（rank 从 1 起） */
  ids: string[];
  /** 该路权重，默认 1 */
  weight?: number;
};

export type FuseRrfOptions = {
  /** RRF 平滑常数，默认 60 */
  kRrf?: number;
  /** 截断条数；不传则返回全部融合结果 */
  limit?: number;
};

export type FusedHit = {
  id: string;
  score: number;
};

/**
 * Reciprocal Rank Fusion：按名次融合多路排序，不依赖原始分数量纲。
 * score(d) = Σ_r weight_r / (kRrf + rank_r(d))
 */
export function fuseRrf(
  lists: RankedList[],
  options: FuseRrfOptions = {},
): FusedHit[] {
  const kRrf = options.kRrf ?? 60;
  if (!Number.isFinite(kRrf) || kRrf < 0) {
    throw new Error('kRrf must be a non-negative number');
  }
  if (
    options.limit !== undefined &&
    (!Number.isFinite(options.limit) || options.limit < 1)
  ) {
    throw new Error('limit must be a positive number');
  }

  const scores = new Map<string, number>();

  for (const list of lists) {
    const weight = list.weight ?? 1;
    if (!Number.isFinite(weight) || weight < 0) {
      throw new Error(
        `weight for "${list.name}" must be a non-negative number`,
      );
    }
    if (weight === 0) continue;

    const seen = new Set<string>();
    list.ids.forEach((id, index) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      const rank = index + 1;
      const prev = scores.get(id) ?? 0;
      scores.set(id, prev + weight / (kRrf + rank));
    });
  }

  const fused = [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  if (options.limit === undefined) return fused;
  return fused.slice(0, options.limit);
}
