'use client';
import { memo, useMemo, useCallback, type ReactNode } from 'react';
import { Actions, Bubble, Think } from '@ant-design/x';
import type { BubbleProps, BubbleItemType } from '@ant-design/x';
import { Avatar } from 'antd';
import {
  OpenAIOutlined,
  UserOutlined,
  ReloadOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { useThemeStore } from '../store/useThemeStore';
import XMarkdown from '@ant-design/x-markdown';
import type { UIMessage, ChatRequestOptions } from 'ai';
import { ChatStatus } from '../types/ChatStatusType';
import type { RetrievalToolResult } from '../tools/retrievalTool';
import type {
  RetrievalStreamEvent,
  RetrievalStreamHit,
} from '../types/RetrievalType';
import '@ant-design/x-markdown/themes/light.css';
import '@ant-design/x-markdown/themes/dark.css';

interface Props {
  messages: UIMessage[];
  status: string;
  regenerate: (options?: ChatRequestOptions) => Promise<void>;
}

type RetrievalProgress = {
  question?: string;
  status: 'start' | 'streaming' | 'done' | 'error';
  hits: Array<RetrievalStreamHit | undefined>;
  count?: number;
  titles?: string[];
  error?: string;
};

function isRetrievalOutput(value: unknown): value is RetrievalToolResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'count' in value &&
    'titles' in value &&
    Array.isArray((value as RetrievalToolResult).titles)
  );
}

function isDataRetrievalPart(
  part: UIMessage['parts'][number],
): part is UIMessage['parts'][number] & {
  type: 'data-retrieval';
  data: RetrievalStreamEvent;
} {
  return part.type === 'data-retrieval' && 'data' in part;
}

/** 从 message.parts 按 toolCallId 聚合 data-retrieval 进度 */
export function collectRetrievalProgress(
  parts: UIMessage['parts'],
): Map<string, RetrievalProgress> {
  const map = new Map<string, RetrievalProgress>();

  for (const part of parts) {
    if (!isDataRetrievalPart(part)) continue;
    const e = part.data;
    const id =
      'toolCallId' in e && e.toolCallId ? e.toolCallId : 'retrieval-error';
    const cur = map.get(id) ?? { status: 'start' as const, hits: [] };
    // start/done 共用同一 part id，客户端 reconcile 后常见顺序为 done → hit*，
    // hit 不得把已完成/失败状态降级回 streaming。
    const terminal = cur.status === 'done' || cur.status === 'error';

    if (e.type === 'start') {
      map.set(id, {
        ...cur,
        question: e.question,
        // 已有后续状态时只补 question，不降级
        status: terminal || cur.status === 'streaming' ? cur.status : 'start',
        hits: cur.hits,
      });
    } else if (e.type === 'hit') {
      const hits = [...cur.hits];
      hits[e.index] = e.hit;
      map.set(id, {
        ...cur,
        status: terminal ? cur.status : 'streaming',
        question: cur.question,
        hits,
      });
    } else if (e.type === 'done') {
      map.set(id, {
        ...cur,
        status: 'done',
        count: e.count,
        titles: e.titles,
        hits: cur.hits,
      });
    } else if (e.type === 'error') {
      map.set(id, {
        ...cur,
        status: 'error',
        error: e.message,
        hits: cur.hits,
      });
    }
  }

  return map;
}

const thinkStyles = {
  root: { marginBottom: 8 },
  status: { color: 'var(--color-placeholder)', fontSize: 12 },
  content: {
    color: 'var(--color-placeholder)',
    fontSize: 12,
    lineHeight: 1.6,
  },
} as const;

function RetrievalHitList({
  titles,
  hits,
}: {
  titles?: string[];
  hits?: RetrievalStreamHit[];
}) {
  if (titles && titles.length > 0) {
    return (
      <ul className="m-0 pl-4 list-disc space-y-0.5">
        {titles.map((t) => (
          <li key={t}>
            <span className="text-[var(--color-font)] opacity-80">{t}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (hits && hits.length > 0) {
    return (
      <ul className="m-0 pl-4 list-disc space-y-1">
        {hits.map((h, i) => (
          <li key={`hit-${i}`}>
            <span className="text-[var(--color-font)] opacity-80">
              {h.title}
            </span>
            {h.snippet ? (
              <div className="opacity-60 line-clamp-2 mt-0.5">{h.snippet}</div>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }
  return <div>无匹配文档</div>;
}

/** 简洁展示：已检索知识库（无 data-retrieval 时的回退，Think 样式对齐） */
function RetrievalCallSummary({
  state,
  output,
}: {
  state: string;
  output: unknown;
}) {
  if (state === 'input-streaming' || state === 'input-available') {
    return (
      <Think
        data-testid="retrieval-call"
        title="正在检索知识库…"
        icon={<SearchOutlined />}
        loading
        blink
        defaultExpanded={false}
        styles={thinkStyles}
      />
    );
  }

  if (state === 'output-error') {
    return (
      <Think
        data-testid="retrieval-call"
        title="知识库检索失败"
        icon={<CloseCircleOutlined />}
        loading={false}
        defaultExpanded={false}
        styles={thinkStyles}
      />
    );
  }

  if (state === 'output-available' && isRetrievalOutput(output)) {
    return (
      <Think
        data-testid="retrieval-call"
        title={`已检索知识库（${output.count} 条）`}
        icon={<CheckCircleOutlined />}
        loading={false}
        defaultExpanded={output.count > 0}
        styles={thinkStyles}
      >
        <RetrievalHitList titles={output.titles} />
      </Think>
    );
  }

  return null;
}

/** data-retrieval 进度：Think 折叠展示 start → hit* → done/error */
function RetrievalProgressView({
  toolCallId,
  progress,
  toolState,
  toolOutput,
}: {
  toolCallId: string;
  progress: RetrievalProgress;
  toolState?: string;
  toolOutput?: unknown;
}) {
  const hitLines = progress.hits.filter(
    (h): h is RetrievalStreamHit => h != null,
  );

  // done 后优先用 done.titles；若丢包则用 tool output 校准
  const doneTitles =
    progress.titles ??
    (isRetrievalOutput(toolOutput) ? toolOutput.titles : undefined);
  const doneCount =
    progress.count ??
    (isRetrievalOutput(toolOutput) ? toolOutput.count : hitLines.length);

  const isError = progress.status === 'error' || toolState === 'output-error';
  // tool 已产出结果时即使 done 帧丢失/被 hit 覆盖，也视为完成
  const isDone =
    !isError &&
    (progress.status === 'done' || toolState === 'output-available');
  const isLoading = !isError && !isDone;

  const title = isError
    ? '知识库检索失败'
    : isDone
      ? `检索完成（${doneCount}）`
      : '正在检索知识库…';

  const icon = isError ? (
    <CloseCircleOutlined />
  ) : isDone ? (
    <CheckCircleOutlined />
  ) : (
    <SearchOutlined />
  );

  return (
    <Think
      data-testid="retrieval-progress"
      data-tool-call-id={toolCallId}
      title={title}
      icon={icon}
      loading={isLoading}
      blink={isLoading}
      defaultExpanded
      styles={thinkStyles}
    >
      {isError ? (
        <div>{progress.error || '检索过程出错，请稍后重试。'}</div>
      ) : (
        <>
          {progress.question ? (
            <div className="mb-1 opacity-70">查询：{progress.question}</div>
          ) : null}
          {/* 检索中：有 hit 就逐条展示；尚无 hit 时显示占位 */}
          {isLoading && hitLines.length === 0 ? (
            <div className="opacity-60">正在搜索相关文档…</div>
          ) : (
            <RetrievalHitList
              titles={isDone ? doneTitles : undefined}
              hits={hitLines}
            />
          )}
        </>
      )}
    </Think>
  );
}

function buildRetrievalBlocks(parts: UIMessage['parts']): ReactNode[] {
  const progressMap = collectRetrievalProgress(parts);
  const toolById = new Map<string, { state: string; output: unknown }>();
  const order: string[] = [];

  for (const part of parts) {
    if (isDataRetrievalPart(part)) {
      const e = part.data;
      const id =
        'toolCallId' in e && e.toolCallId ? e.toolCallId : 'retrieval-error';
      if (!order.includes(id)) order.push(id);
      continue;
    }
    if (part.type === 'tool-getInformation') {
      if (!order.includes(part.toolCallId)) order.push(part.toolCallId);
      toolById.set(part.toolCallId, {
        state: part.state,
        output: 'output' in part ? part.output : undefined,
      });
    }
  }

  return order
    .map((id) => {
      const progress = progressMap.get(id);
      const tool = toolById.get(id);
      if (progress) {
        return (
          <RetrievalProgressView
            key={id}
            toolCallId={id}
            progress={progress}
            toolState={tool?.state}
            toolOutput={tool?.output}
          />
        );
      }
      if (tool) {
        // —— 原逻辑：仅 tool-getInformation 摘要（历史消息 / 无 data-retrieval）——
        return (
          <RetrievalCallSummary
            key={id}
            state={tool.state}
            output={tool.output}
          />
        );
      }
      return null;
    })
    .filter(Boolean);
}

function ChatBubble({ messages, status, regenerate }: Props) {
  const { theme } = useThemeStore();
  const isIdle =
    status !== ChatStatus.Submitted && status !== ChatStatus.Streaming;
  const className = theme === 'light' ? 'x-markdown-light' : 'x-markdown-dark';
  const isStreaming = status === ChatStatus.Streaming;

  const renderMarkdown = useCallback(
    (content: string) => {
      return (
        <XMarkdown
          className={className}
          content={content}
          paragraphTag="div"
          streaming={{
            hasNextChunk: isStreaming,
            enableAnimation: false,
            incompleteMarkdownComponentMap: {
              link: 'loading-link',
              image: 'loading-image',
            },
          }}
        />
      );
    },
    [className, isStreaming],
  );

  const items: BubbleItemType[] = useMemo(() => {
    const actionItems = (content: string, showRegenerate: boolean) => {
      const items = [
        {
          key: 'copy',
          label: 'copy',
          actionRender: () => {
            return (
              <Actions.Copy
                text={content}
                styles={{ root: { color: 'var(--color-font)' } }}
              />
            );
          },
        },
      ];

      if (showRegenerate && isIdle) {
        items.push({
          key: 'regenerate',
          label: 'regenerate',
          actionRender: () => {
            return (
              <ReloadOutlined
                style={{ color: 'var(--color-font)', cursor: 'pointer' }}
                onClick={() => {
                  regenerate().catch((err) => {
                    console.error('Regenerate failed:', err);
                  });
                }}
              />
            );
          },
        });
      }

      return items;
    };

    const lastAssistantIndex = messages.reduce(
      (lastIdx, msg, idx) => (msg.role === 'assistant' ? idx : lastIdx),
      -1,
    );

    const bubbleItems: BubbleItemType[] = messages.map((msg, i) => {
      let text = '';
      for (let j = 0; j < msg.parts.length; j++) {
        const part = msg.parts[j];
        if (part.type === 'text') {
          text += part.text;
        }
      }
      const retrievalSummaries = buildRetrievalBlocks(msg.parts);

      // —— 原逻辑（仅扫 tool-getInformation）：保留对照，勿删 ——
      // const retrievalSummaries: ReactNode[] = [];
      // for (let j = 0; j < msg.parts.length; j++) {
      //   const part = msg.parts[j];
      //   if (part.type === 'text') {
      //     text += part.text;
      //     continue;
      //   }
      //   if (part.type === 'tool-getInformation') {
      //     retrievalSummaries.push(
      //       <RetrievalCallSummary
      //         key={part.toolCallId}
      //         state={part.state}
      //         output={'output' in part ? part.output : undefined}
      //       />,
      //     );
      //   }
      // }

      const isUser = msg.role === 'user';
      const isLastAssistant = !isUser && i === lastAssistantIndex;

      const content: string | ReactNode = isUser ? (
        text
      ) : (
        <div>
          {retrievalSummaries}
          {text ? renderMarkdown(text) : null}
        </div>
      );

      return {
        key: msg.id,
        role: msg.role as string,
        content,
        shape: 'corner' as const,
        placement: (isUser ? 'end' : 'start') as BubbleProps['placement'],
        avatar: (
          <Avatar icon={isUser ? <UserOutlined /> : <OpenAIOutlined />} />
        ),
        extra: <Actions items={actionItems(text, isLastAssistant)} />,
        contentRender: undefined,
        styles: {
          content: {
            backgroundColor: 'var(--color-default)',
            color: 'var(--color-font)',
          },
        },
      };
    });

    if (
      status === ChatStatus.Submitted &&
      messages.length > 0 &&
      messages[messages.length - 1]?.role !== 'assistant'
    ) {
      bubbleItems.push({
        key: 'thinking',
        role: 'assistant' as string,
        content: (
          <span className="inline-flex items-center gap-1">
            <span className="animate-pulse-dot w-2 h-2 rounded-full bg-current opacity-50" />
            <span
              className="animate-pulse-dot w-2 h-2 rounded-full bg-current opacity-50"
              style={{ animationDelay: '0.2s' }}
            />
            <span
              className="animate-pulse-dot w-2 h-2 rounded-full bg-current opacity-50"
              style={{ animationDelay: '0.4s' }}
            />
          </span>
        ),
        shape: 'corner' as const,
        placement: 'start' as BubbleProps['placement'],
        avatar: <Avatar icon={<OpenAIOutlined />} />,
        contentRender: undefined,
        styles: {
          content: {
            backgroundColor: 'var(--color-default)',
            color: 'var(--color-font)',
            minWidth: 52,
            display: 'flex',
            justifyContent: 'center',
          },
        },
      });
    }

    return bubbleItems;
  }, [messages, status, renderMarkdown, isIdle, regenerate]);

  return (
    <Bubble.List
      items={items}
      autoScroll={true}
      className={'h-full'}
      styles={{ scroll: { scrollbarWidth: 'none' } }}
    />
  );
}

export default memo(ChatBubble);
