/**
 * wink-bm25 prepTask：最后一个函数须返回 string[]。
 * 中文用 Intl.Segmenter；英文/数字用正则；无 Segmenter 时对汉字做 unigram+bigram。
 */
export function prepTask(text: string): string[] {
  const normalized = String(text ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return [];

  const tokens: string[] = [];

  for (const match of normalized.matchAll(/[a-z0-9_]+/g)) {
    if (match[0]) tokens.push(match[0]);
  }

  const nonAscii = normalized.replace(/[a-z0-9_]+/g, ' ');
  const SegmenterCtor = (
    Intl as typeof Intl & {
      Segmenter?: new (
        locales?: string | string[],
        options?: { granularity?: string },
      ) => {
        segment: (
          input: string,
        ) => Iterable<{ segment: string; isWordLike?: boolean }>;
      };
    }
  ).Segmenter;

  if (typeof SegmenterCtor === 'function') {
    const segmenter = new SegmenterCtor('zh', { granularity: 'word' });
    for (const { segment, isWordLike } of segmenter.segment(nonAscii)) {
      const s = segment.trim();
      if (!s) continue;
      if (isWordLike === false && !/[\u4e00-\u9fff]/.test(s)) continue;
      if (/[\u4e00-\u9fff]/.test(s) || (isWordLike && s.length > 0)) {
        tokens.push(s);
      }
    }
  } else {
    const cjk = nonAscii.replace(/[^\u4e00-\u9fff]/g, '');
    for (let i = 0; i < cjk.length; i++) {
      tokens.push(cjk[i]!);
      if (i + 1 < cjk.length) {
        tokens.push(cjk.slice(i, i + 2));
      }
    }
  }

  return tokens.filter((t) => t.length > 0);
}
