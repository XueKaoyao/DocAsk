import { prepTask } from '../prepTask';
import {
  clearCorpus,
  getCorpusSize,
  replaceCorpus,
  type Bm25Doc,
} from '../corpus';
import { flushRebuild, searchEngine } from '../winkEngine';
import { searchBm25 } from '../searchBm25';

describe('prepTask', () => {
  it('tokenizes english and digits', () => {
    const tokens = prepTask('LanceDB error P1001');
    expect(tokens).toEqual(
      expect.arrayContaining(['lancedb', 'error', 'p1001']),
    );
  });

  it('tokenizes chinese words', () => {
    const tokens = prepTask('忘记密码怎么办');
    expect(tokens.some((t) => /[\u4e00-\u9fff]/.test(t))).toBe(true);
  });

  it('returns empty for blank', () => {
    expect(prepTask('   ')).toEqual([]);
  });
});

describe('searchBm25', () => {
  beforeEach(async () => {
    await clearCorpus();
    const docs: Array<{ id: string; doc: Bm25Doc }> = [
      {
        id: 'doc1#0',
        doc: {
          snippet: '如果忘记了账户密码，可以在登录页点击忘记密码。',
          title: '如何重置登录密码',
          documentId: 'doc1',
          filename: 'password.md',
          page: 0,
          index: 0,
        },
      },
      {
        id: 'doc2#0',
        doc: {
          snippet: '今天白天多云转阴，气温大约在 18℃ 到 24℃ 之间。',
          title: '今日天气与出行建议',
          documentId: 'doc2',
          filename: 'weather.md',
          page: 0,
          index: 0,
        },
      },
      {
        id: 'doc1#1',
        doc: {
          snippet: '新密码建议至少 8 位，包含字母和数字。',
          title: '如何重置登录密码',
          documentId: 'doc1',
          filename: 'password.md',
          page: 0,
          index: 1,
        },
      },
    ];
    await replaceCorpus(docs);
    await flushRebuild();
  });

  afterEach(async () => {
    await clearCorpus();
    await flushRebuild();
  });

  it('hits password-related chunks for 密码 query', async () => {
    const { hits } = await searchBm25('密码', 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(
      hits.every(
        (h) =>
          h.documentId === 'doc1' ||
          h.snippet.includes('密码') ||
          h.title.includes('密码'),
      ),
    ).toBe(true);
    expect(hits.some((h) => h.id.startsWith('doc1'))).toBe(true);
  });

  it('filters by docId', async () => {
    const { hits } = await searchBm25('密码', 5, 'doc1');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.documentId === 'doc1')).toBe(true);
  });

  it('searchEngine returns pairs', async () => {
    const pairs = await searchEngine('天气', 3);
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs[0]?.id).toBeTruthy();
  });

  it('reports corpus size', async () => {
    expect(await getCorpusSize()).toBe(3);
  });
});
