import {
  hitAtK,
  mean,
  precisionAtK,
  recallAtK,
  retrievedDocIdsFromTitles,
  round4,
} from '../metrics';

describe('retrieval metrics', () => {
  const relevant = ['如何重置登录密码', '焦虑时的简单呼吸练习'];

  it('recallAtK counts fraction of relevant docs in top-k', () => {
    const retrieved = [
      '如何重置登录密码',
      '番茄肉酱意面简易做法',
      '焦虑时的简单呼吸练习',
    ];
    expect(recallAtK(retrieved, relevant, 3)).toBe(1);
    expect(recallAtK(retrieved, relevant, 1)).toBe(0.5);
    expect(recallAtK(retrieved, relevant, 2)).toBe(0.5);
  });

  it('precisionAtK uses unique docs in top-k as denominator', () => {
    const retrieved = [
      '如何重置登录密码',
      '如何重置登录密码',
      '番茄肉酱意面简易做法',
    ];
    expect(precisionAtK(retrieved, relevant, 3)).toBe(0.5);
  });

  it('hitAtK is 1 when any relevant appears', () => {
    expect(hitAtK(['番茄肉酱意面简易做法'], relevant, 3)).toBe(0);
    expect(hitAtK(['焦虑时的简单呼吸练习'], relevant, 3)).toBe(1);
  });

  it('returns null for empty relevant (negatives)', () => {
    expect(recallAtK(['x'], [], 3)).toBeNull();
    expect(precisionAtK(['x'], [], 3)).toBeNull();
    expect(hitAtK(['x'], [], 3)).toBeNull();
  });

  it('retrievedDocIdsFromTitles dedupes and respects k on raw hits', () => {
    expect(retrievedDocIdsFromTitles(['A', 'A', 'B', 'C'], 3)).toEqual([
      'A',
      'B',
    ]);
  });

  it('mean and round4', () => {
    expect(mean([1, 0.5, 0.5])).toBeCloseTo(2 / 3);
    expect(round4(0.66666)).toBe(0.6667);
  });
});
