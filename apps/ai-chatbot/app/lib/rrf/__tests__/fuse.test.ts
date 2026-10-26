import { fuseRrf } from '../fuse';

describe('fuseRrf', () => {
  it('fuses two lists by reciprocal rank', () => {
    const fused = fuseRrf(
      [
        { name: 'vector', ids: ['a', 'b', 'c'] },
        { name: 'bm25', ids: ['b', 'd', 'a'] },
      ],
      { kRrf: 60 },
    );

    // b: vec rank2 + bm25 rank1 → 1/62 + 1/61
    // a: vec rank1 + bm25 rank3 → 1/61 + 1/63
    // d: bm25 rank2 → 1/62
    // c: vec rank3 → 1/63
    expect(fused.map((h) => h.id)).toEqual(['b', 'a', 'd', 'c']);
    expect(fused[0]!.score).toBeCloseTo(1 / 62 + 1 / 61, 10);
    expect(fused[1]!.score).toBeCloseTo(1 / 61 + 1 / 63, 10);
  });

  it('keeps relative order when both lists are identical', () => {
    const fused = fuseRrf(
      [
        { name: 'vector', ids: ['x', 'y', 'z'] },
        { name: 'bm25', ids: ['x', 'y', 'z'] },
      ],
      { kRrf: 60, limit: 3 },
    );
    expect(fused.map((h) => h.id)).toEqual(['x', 'y', 'z']);
  });

  it('degrades to the non-empty list when one side is empty', () => {
    const fused = fuseRrf(
      [
        { name: 'vector', ids: [] },
        { name: 'bm25', ids: ['p', 'q'] },
      ],
      { kRrf: 60 },
    );
    expect(fused.map((h) => h.id)).toEqual(['p', 'q']);
    expect(fused[0]!.score).toBeCloseTo(1 / 61, 10);
  });

  it('respects limit and weight', () => {
    const fused = fuseRrf(
      [
        { name: 'vector', ids: ['a', 'b'], weight: 1 },
        { name: 'bm25', ids: ['b', 'a'], weight: 2 },
      ],
      { kRrf: 0, limit: 1 },
    );
    // kRrf=0: a = 1/1 + 2/2 = 2; b = 1/2 + 2/1 = 2.5
    expect(fused).toHaveLength(1);
    expect(fused[0]!.id).toBe('b');
    expect(fused[0]!.score).toBeCloseTo(2.5, 10);
  });

  it('ignores duplicate ids within one list (first rank wins)', () => {
    const fused = fuseRrf([{ name: 'vector', ids: ['a', 'a', 'b'] }], {
      kRrf: 60,
    });
    expect(fused.map((h) => h.id)).toEqual(['a', 'b']);
    expect(fused[0]!.score).toBeCloseTo(1 / 61, 10);
  });
});
