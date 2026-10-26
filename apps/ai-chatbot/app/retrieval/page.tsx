'use client';

import { useEffect, useState } from 'react';
import {
  Button,
  Checkbox,
  Empty,
  Input,
  InputNumber,
  Select,
  Tag,
  message,
} from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { apiFetch } from '@myworkspace/fetch';
import type {
  RetrievalCacheStatus,
  RetrievalMode,
  RetrievalTimings,
  SearchHit,
  SearchResponse,
} from '../types/RetrievalType';
import { useDocumentCrud } from '../hooks/useDocumentCrud';
import { useRouter } from 'next/navigation';

type DocOption = { value: string; label: string };

type TimingSample = {
  at: number;
  query: string;
  mode: RetrievalMode;
  cache?: RetrievalCacheStatus;
  timings: RetrievalTimings;
};

const ALL_DOCS_OPTION: DocOption = { value: '无', label: '无' };

const MODE_OPTIONS: Array<{ value: RetrievalMode; label: string }> = [
  { value: 'hybrid', label: 'Hybrid (RRF)' },
  { value: 'vector', label: '向量' },
  { value: 'bm25', label: 'BM25' },
];

const TIMING_LABELS: Array<{ key: keyof RetrievalTimings; label: string }> = [
  { key: 'totalMs', label: '总计' },
  { key: 'validateMs', label: '校验' },
  { key: 'openTableMs', label: '开表' },
  { key: 'searchMs', label: '检索' },
  { key: 'mapMs', label: '映射' },
  { key: 'vectorMs', label: '向量' },
  { key: 'bm25Ms', label: 'BM25' },
  { key: 'fuseMs', label: 'RRF' },
  { key: 'cacheHitMs', label: '读缓存' },
  { key: 'rerankMs', label: '重排序' },
];

function cacheTagColor(cache: RetrievalCacheStatus): string {
  if (cache === 'HIT') return '#52c41a';
  if (cache === 'MISS') return '#1677ff';
  return '#8c8c8c';
}

const SUGGESTED_QUERIES = [
  '忘记密码怎么办',
  '出门要不要带伞',
  '晚餐想煮面吃',
  '接口 500 如何定位',
  '紧张时怎么让自己平静',
];

function scoreColor(
  score: number,
  mode: RetrievalMode,
  reranked: boolean,
): string {
  if (reranked || mode === 'vector') {
    if (score >= 0.8) return '#52c41a';
    if (score >= 0.65) return '#1677ff';
    if (score >= 0.5) return '#faad14';
    return '#8c8c8c';
  }
  if (score >= 0.03) return '#52c41a';
  if (score >= 0.02) return '#1677ff';
  if (score >= 0.01) return '#faad14';
  return '#8c8c8c';
}

function formatScore(
  score: number,
  mode: RetrievalMode,
  reranked: boolean,
): string {
  if (reranked || mode === 'vector') return `${(score * 100).toFixed(1)}%`;
  return score.toFixed(4);
}

function scoreCaption(mode: RetrievalMode, reranked: boolean): string {
  if (reranked) return 'Jina';
  if (mode === 'hybrid') return 'RRF';
  if (mode === 'bm25') return 'BM25';
  return '相似度';
}

function formatMs(ms: number): string {
  return `${ms.toFixed(1)} ms`;
}

export default function RetrievalPage() {
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(3);
  const [mode, setMode] = useState<RetrievalMode>('hybrid');
  const [bypassCache, setBypassCache] = useState(false);
  const [rerank, setRerank] = useState(false);
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const [submittedMode, setSubmittedMode] = useState<RetrievalMode>('hybrid');
  const [submittedReranked, setSubmittedReranked] = useState(false);
  const [cacheStatus, setCacheStatus] = useState<RetrievalCacheStatus | null>(
    null,
  );
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [timings, setTimings] = useState<RetrievalTimings | null>(null);
  const [timingHistory, setTimingHistory] = useState<TimingSample[]>([]);
  const [loading, setLoading] = useState(false);
  const [docOptions, setDocOptions] = useState<DocOption[]>([ALL_DOCS_OPTION]);
  const [selectedDoc, setSelectedDoc] = useState<string | null>('无');
  const { getDocuments } = useDocumentCrud();
  const router = useRouter();
  const hasSearched = submittedQuery !== null;

  useEffect(() => {
    let cancelled = false;

    getDocuments()
      .then((documents) => {
        if (cancelled) return;
        setDocOptions([
          ALL_DOCS_OPTION,
          ...documents.map((document) => ({
            value: document.id,
            label: document.title,
          })),
        ]);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        message.error(
          error instanceof Error ? error.message : '加载文档列表失败',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [getDocuments]);

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    try {
      const data = await apiFetch<SearchResponse>('/api/retrieval', {
        method: 'POST',
        data: {
          query: q,
          k: topK,
          docId: selectedDoc,
          mode,
          bypassCache: bypassCache || undefined,
          rerank: rerank || undefined,
        },
        headers: {
          'Content-Type': 'application/json',
        },
      });
      const usedMode = data.mode ?? mode;
      const usedCache = data.cache ?? null;
      setSubmittedQuery(q);
      setSubmittedMode(usedMode);
      setSubmittedReranked(Boolean(data.reranked));
      setCacheStatus(usedCache);
      setHits(data.results ?? []);
      if (data.timings) {
        setTimings(data.timings);
        setTimingHistory((prev) =>
          [
            {
              at: Date.now(),
              query: q,
              mode: usedMode,
              cache: usedCache ?? undefined,
              timings: data.timings!,
            },
            ...prev,
          ].slice(0, 5),
        );
      } else {
        setTimings(null);
      }
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : '检索失败，请稍后重试',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (value: string) => {
    setSelectedDoc(value);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full max-w-4xl px-10 mx-auto overflow-y-auto scrollbar-none my-6">
      <div className="shrink-0 pb-4 flex flex-row items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-font)] m-0">
            知识库检索测试
          </h1>
          <p className="mt-2 mb-0 text-sm text-[var(--color-placeholder)]">
            支持向量 / BM25 / Hybrid(RRF)；可选 Jina 重排序与 Redis 缓存
          </p>
        </div>
        <Button
          styles={{
            root: {
              backgroundColor: 'var(--color-fontbg)',
              borderColor: 'var(--color-third)',
              color: 'var(--color-font)',
            },
          }}
          onClick={() => {
            router.push('/documents');
          }}
        >
          Documents
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-[var(--color-secondary)] bg-[var(--skeleton-shine)] p-4">
          <label className="block text-sm mb-2 text-[var(--color-font)]">
            查询内容
          </label>
          <Input.TextArea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoSize={{ minRows: 3, maxRows: 6 }}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                handleSearch();
              }
            }}
            styles={{
              textarea: {
                backgroundColor: 'var(--color-fontbg)',
                color: 'var(--color-font)',
                borderColor: 'var(--color-third)',
                padding: '10px',
              },
            }}
          />
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--color-font)]">选定文档</span>
              <Select
                className="retrieval-doc-select"
                classNames={{
                  popup: { root: 'retrieval-doc-select-popup' },
                }}
                defaultValue={selectedDoc}
                style={{ width: 200 }}
                styles={{
                  root: {
                    backgroundColor: 'var(--color-fontbg)',
                    borderColor: 'var(--color-third)',
                    color: 'var(--color-font)',
                  },
                  popup: {
                    root: {
                      backgroundColor: 'var(--color-third)',
                      border: '1px solid var(--color-third)',
                    },
                  },
                }}
                onChange={handleChange}
                options={docOptions}
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--color-font)]">模式</span>
              <Select
                className="retrieval-doc-select"
                classNames={{
                  popup: { root: 'retrieval-doc-select-popup' },
                }}
                value={mode}
                style={{ width: 160 }}
                styles={{
                  root: {
                    backgroundColor: 'var(--color-fontbg)',
                    borderColor: 'var(--color-third)',
                    color: 'var(--color-font)',
                  },
                  popup: {
                    root: {
                      backgroundColor: 'var(--color-third)',
                      border: '1px solid var(--color-third)',
                    },
                  },
                }}
                onChange={(value: RetrievalMode) => setMode(value)}
                options={MODE_OPTIONS}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--color-font)]">Top K</span>
              <InputNumber
                min={1}
                max={20}
                value={topK}
                onChange={(v) => setTopK(typeof v === 'number' ? v : 3)}
                styles={{
                  root: {
                    backgroundColor: 'var(--color-fontbg)',
                    borderColor: 'var(--color-third)',
                  },
                  input: {
                    color: 'var(--color-font)',
                  },
                }}
              />
            </div>
            <Checkbox
              checked={rerank}
              onChange={(e) => setRerank(e.target.checked)}
              styles={{
                label: {
                  color: 'var(--color-font)',
                },
              }}
            >
              Rerank
            </Checkbox>
            <Checkbox
              checked={bypassCache}
              onChange={(e) => setBypassCache(e.target.checked)}
              styles={{
                label: {
                  color: 'var(--color-font)',
                },
              }}
            >
              绕过缓存
            </Checkbox>
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={handleSearch}
              disabled={!query.trim()}
              loading={loading}
              styles={{
                root: {
                  backgroundColor: 'var(--color-fontbg)',
                  borderColor: 'var(--color-third)',
                  color: 'var(--color-font)',
                },
              }}
            >
              检索
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {SUGGESTED_QUERIES.map((q) => (
              <Tag
                key={q}
                className="retrieval-suggest-tag cursor-pointer m-0!"
                onClick={() => setQuery(q)}
                styles={{
                  root: {
                    backgroundColor: 'var(--color-fontbg)',
                    borderColor: 'var(--color-third)',
                    color: 'var(--color-font)',
                    padding: '5px 10px',
                    borderRadius: '10px',
                  },
                }}
              >
                {q}
              </Tag>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 py-5">
          {hasSearched && (
            <>
              <div className="mb-4 flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <p className="m-0 text-sm text-[var(--color-font)]">
                    查询：「
                    <span className="font-medium">{submittedQuery}</span>」
                    <span className="ml-2 text-[var(--color-placeholder)]">
                      ·{' '}
                      {
                        MODE_OPTIONS.find((o) => o.value === submittedMode)
                          ?.label
                      }
                    </span>
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {submittedReranked && (
                      <Tag
                        className="m-0!"
                        styles={{
                          root: {
                            backgroundColor: 'var(--color-fontbg)',
                            borderColor: '#722ed1',
                            color: '#722ed1',
                            padding: '4px 10px',
                          },
                        }}
                      >
                        已重排序
                      </Tag>
                    )}
                    {cacheStatus && (
                      <Tag
                        className="m-0!"
                        styles={{
                          root: {
                            backgroundColor: 'var(--color-fontbg)',
                            borderColor: cacheTagColor(cacheStatus),
                            color: cacheTagColor(cacheStatus),
                            padding: '4px 10px',
                          },
                        }}
                      >
                        缓存 {cacheStatus}
                      </Tag>
                    )}
                  </div>
                </div>

                {timings && (
                  <div className="rounded-xl border border-[var(--color-third)] bg-[var(--color-fontbg)] p-3">
                    <p className="m-0 mb-2 text-sm font-medium text-[var(--color-font)]">
                      本次耗时
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {TIMING_LABELS.filter(
                        ({ key }) => typeof timings[key] === 'number',
                      ).map(({ key, label }) => (
                        <Tag
                          key={key}
                          className="m-0!"
                          styles={{
                            root: {
                              backgroundColor: 'var(--color-primary)',
                              borderColor: 'var(--color-third)',
                              color: 'var(--color-font)',
                              padding: '4px 8px',
                            },
                          }}
                        >
                          {label}: {formatMs(timings[key] as number)}
                        </Tag>
                      ))}
                    </div>
                    {timingHistory.length > 1 && (
                      <div className="mt-3">
                        <p className="m-0 mb-1 text-xs text-[var(--color-placeholder)]">
                          最近 {timingHistory.length} 次（便于对比冷/热启动）
                        </p>
                        <ul className="m-0 p-0 list-none flex flex-col gap-1 text-xs text-[var(--color-font)]">
                          {timingHistory.map((sample, i) => (
                            <li
                              key={`${sample.at}-${i}`}
                              className="tabular-nums"
                            >
                              #{timingHistory.length - i} {sample.mode}
                              {sample.cache ? ` ${sample.cache}` : ''} 总计{' '}
                              {formatMs(sample.timings.totalMs)}
                              {' · '}检索 {formatMs(sample.timings.searchMs)}
                              {typeof sample.timings.cacheHitMs === 'number'
                                ? ` · 读缓存 ${formatMs(sample.timings.cacheHitMs)}`
                                : ''}
                              {' · '}
                              <span className="text-[var(--color-placeholder)]">
                                {sample.query.slice(0, 24)}
                                {sample.query.length > 24 ? '…' : ''}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {hits.length === 0 ? (
                <Empty description="未命中文档（请先 seed 写入带向量的文档）" />
              ) : (
                <ul className="list-none m-0 p-0 flex flex-col gap-5">
                  {hits.map((hit, index) => (
                    <li
                      key={hit.id}
                      className="rounded-xl border border-[var(--color-third)] bg-[var(--color-fontbg)] p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span>{`${index + 1}. ${hit.title}`}</span>
                            {(hit.filename || hit.page > 0) && (
                              <span className="text-xs text-[var(--color-placeholder)]">
                                {[
                                  hit.filename || null,
                                  hit.page > 0 ? `第 ${hit.page} 页` : null,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </span>
                            )}
                          </div>
                          <p className="m-0 text-sm leading-6 text-[var(--color-font)] whitespace-pre-wrap">
                            {hit.snippet}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <div
                            className="text-lg font-semibold tabular-nums"
                            style={{
                              color: scoreColor(
                                hit.score,
                                submittedMode,
                                submittedReranked,
                              ),
                            }}
                          >
                            {formatScore(
                              hit.score,
                              submittedMode,
                              submittedReranked,
                            )}
                          </div>
                          <div className="text-xs text-[var(--color-placeholder)] mb-1">
                            {scoreCaption(submittedMode, submittedReranked)}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
