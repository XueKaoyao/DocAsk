import { render, screen } from '@testing-library/react';
import ChatBubble from '../ChatBubble';
import { ChatStatus } from '../../types/ChatStatusType';

// Mock @ant-design/x (Bubble.List, Actions)
// The Bubble.List mock renders content, extra (Actions), and calls
// contentRender for markdown rendering (assistant messages).
jest.mock('@ant-design/x', () => ({
  Bubble: {
    List: ({
      items,
    }: {
      items?: Array<{
        key: string;
        role: string;
        content: string | React.ReactNode;
        placement?: string;
        extra?: React.ReactNode;
        contentRender?: (content: string) => React.ReactNode;
      }>;
    }) => (
      <div data-testid="bubble-list">
        {items?.map((item) => {
          const renderedContent =
            item.contentRender && typeof item.content === 'string'
              ? item.contentRender(item.content)
              : item.content;
          return (
            <div
              key={item.key}
              data-testid={`bubble-${item.key}`}
              data-role={item.role}
              data-placement={item.placement}
            >
              <div data-testid={`bubble-content-${item.key}`}>
                {renderedContent}
              </div>
              {item.extra && (
                <div data-testid={`bubble-extra-${item.key}`}>{item.extra}</div>
              )}
            </div>
          );
        })}
      </div>
    ),
  },
  Think: ({
    title,
    children,
    loading,
    ...rest
  }: {
    title?: React.ReactNode;
    children?: React.ReactNode;
    loading?: boolean | React.ReactNode;
    'data-testid'?: string;
    'data-tool-call-id'?: string;
  }) => (
    <div
      data-testid={rest['data-testid']}
      data-tool-call-id={rest['data-tool-call-id']}
      data-loading={loading ? 'true' : 'false'}
    >
      <div data-testid="think-title">{title}</div>
      {children ? <div data-testid="think-content">{children}</div> : null}
    </div>
  ),
  // Actions component renders a list of action items (Copy, Regenerate, etc.)
  Actions: Object.assign(
    ({
      items,
    }: {
      items?: Array<{
        key: string;
        label: string;
        actionRender?: () => React.ReactNode;
      }>;
    }) => (
      <div data-testid="actions">
        {items?.map((item) => (
          <span key={item.key} data-testid={`action-${item.key}`}>
            {item.actionRender?.()}
          </span>
        ))}
      </div>
    ),
    {
      Copy: () => <button data-testid="copy-action">Copy</button>,
    },
  ),
}));

// Mock @ant-design/x-markdown
jest.mock('@ant-design/x-markdown', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => (
    <div data-testid="x-markdown">{content}</div>
  ),
}));

// Mock CSS imports
jest.mock('@ant-design/x-markdown/themes/light.css', () => ({}));
jest.mock('@ant-design/x-markdown/themes/dark.css', () => ({}));

// Mock antd Avatar
jest.mock('antd', () => ({
  Avatar: ({ icon }: { icon?: React.ReactNode }) => (
    <div data-testid="avatar">{icon}</div>
  ),
}));

// Mock @ant-design/icons
jest.mock('@ant-design/icons', () => ({
  OpenAIOutlined: () => <span>AI</span>,
  UserOutlined: () => <span>User</span>,
  SearchOutlined: () => <span>Search</span>,
  CheckCircleOutlined: () => <span>Check</span>,
  CloseCircleOutlined: () => <span>Close</span>,
  ReloadOutlined: ({
    onClick,
    style,
  }: {
    onClick?: () => void;
    style?: Record<string, string>;
  }) => (
    <button data-testid="regenerate-btn" onClick={onClick} style={style}>
      Regenerate
    </button>
  ),
}));

// Mock useThemeStore
jest.mock('../../store/useThemeStore', () => ({
  useThemeStore: () => ({ theme: 'light' }),
}));

// Helper to create mock UIMessage objects
function createMessage(
  id: string,
  role: 'user' | 'assistant',
  text: string,
): import('ai').UIMessage {
  return {
    id,
    role,
    parts: [{ type: 'text', text }],
    createdAt: new Date(),
  } as import('ai').UIMessage;
}

describe('ChatBubble', () => {
  const mockRegenerate = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    mockRegenerate.mockClear();
  });

  describe('rendering', () => {
    it('renders a Bubble.List', () => {
      render(
        <ChatBubble
          messages={[]}
          status={ChatStatus.Ready}
          regenerate={mockRegenerate}
        />,
      );
      expect(screen.getByTestId('bubble-list')).toBeInTheDocument();
    });

    it('renders user messages', () => {
      const messages = [createMessage('1', 'user', 'Hello')];
      render(
        <ChatBubble
          messages={messages}
          status={ChatStatus.Ready}
          regenerate={mockRegenerate}
        />,
      );

      expect(screen.getByTestId('bubble-1')).toBeInTheDocument();
      expect(screen.getByTestId('bubble-1').dataset.role).toBe('user');
      expect(screen.getByTestId('bubble-1').dataset.placement).toBe('end');
    });

    it('renders assistant messages', () => {
      const messages = [createMessage('2', 'assistant', 'Hi there!')];
      render(
        <ChatBubble
          messages={messages}
          status={ChatStatus.Ready}
          regenerate={mockRegenerate}
        />,
      );

      expect(screen.getByTestId('bubble-2')).toBeInTheDocument();
      expect(screen.getByTestId('bubble-2').dataset.role).toBe('assistant');
      expect(screen.getByTestId('bubble-2').dataset.placement).toBe('start');
    });

    it('renders copy action for each message', () => {
      const messages = [
        createMessage('1', 'user', 'Hello'),
        createMessage('2', 'assistant', 'Hi'),
      ];
      render(
        <ChatBubble
          messages={messages}
          status={ChatStatus.Ready}
          regenerate={mockRegenerate}
        />,
      );

      const copyButtons = screen.getAllByTestId('copy-action');
      expect(copyButtons).toHaveLength(2);
    });
  });

  describe('streaming indicator', () => {
    it('shows thinking dots when status is Submitted and last message is from user', () => {
      const messages = [createMessage('1', 'user', 'What is AI?')];
      render(
        <ChatBubble
          messages={messages}
          status={ChatStatus.Submitted}
          regenerate={mockRegenerate}
        />,
      );

      expect(screen.getByTestId('bubble-thinking')).toBeInTheDocument();
    });

    it('does not show thinking dots when status is Ready', () => {
      const messages = [createMessage('1', 'user', 'What is AI?')];
      render(
        <ChatBubble
          messages={messages}
          status={ChatStatus.Ready}
          regenerate={mockRegenerate}
        />,
      );

      expect(screen.queryByTestId('bubble-thinking')).not.toBeInTheDocument();
    });

    it('does not show thinking dots when last message is already from assistant', () => {
      const messages = [
        createMessage('1', 'user', 'Hello'),
        createMessage('2', 'assistant', 'Hi!'),
      ];
      render(
        <ChatBubble
          messages={messages}
          status={ChatStatus.Submitted}
          regenerate={mockRegenerate}
        />,
      );

      expect(screen.queryByTestId('bubble-thinking')).not.toBeInTheDocument();
    });

    it('does not show thinking dots on empty messages', () => {
      render(
        <ChatBubble
          messages={[]}
          status={ChatStatus.Submitted}
          regenerate={mockRegenerate}
        />,
      );

      expect(screen.queryByTestId('bubble-thinking')).not.toBeInTheDocument();
    });
  });

  describe('regenerate', () => {
    it('shows regenerate button only for the last assistant message when idle', () => {
      const messages = [
        createMessage('1', 'user', 'Hello'),
        createMessage('2', 'assistant', 'Hi there!'),
        createMessage('3', 'user', 'How are you?'),
        createMessage('4', 'assistant', 'I am fine!'),
      ];
      render(
        <ChatBubble
          messages={messages}
          status={ChatStatus.Ready}
          regenerate={mockRegenerate}
        />,
      );

      // Regenerate button should exist for the last assistant message
      const regenerateBtns = screen.getAllByTestId('regenerate-btn');
      expect(regenerateBtns).toHaveLength(1);
    });

    it('does not show regenerate when status is streaming', () => {
      const messages = [
        createMessage('1', 'user', 'Hello'),
        createMessage('2', 'assistant', 'Hi!'),
      ];
      render(
        <ChatBubble
          messages={messages}
          status={ChatStatus.Streaming}
          regenerate={mockRegenerate}
        />,
      );

      expect(screen.queryByTestId('regenerate-btn')).not.toBeInTheDocument();
    });

    it('does not show regenerate when status is submitted', () => {
      const messages = [
        createMessage('1', 'user', 'Hello'),
        createMessage('2', 'assistant', 'Hi!'),
      ];
      render(
        <ChatBubble
          messages={messages}
          status={ChatStatus.Submitted}
          regenerate={mockRegenerate}
        />,
      );

      expect(screen.queryByTestId('regenerate-btn')).not.toBeInTheDocument();
    });
  });

  describe('markdown rendering', () => {
    it('uses XMarkdown for assistant messages', () => {
      const messages = [createMessage('1', 'assistant', '# Markdown Title')];
      render(
        <ChatBubble
          messages={messages}
          status={ChatStatus.Ready}
          regenerate={mockRegenerate}
        />,
      );

      // XMarkdown is rendered inside the content area via contentRender
      expect(screen.getByTestId('x-markdown')).toBeInTheDocument();
      expect(screen.getByTestId('x-markdown')).toHaveTextContent(
        '# Markdown Title',
      );
    });

    it('does not use XMarkdown for user messages', () => {
      const messages = [createMessage('1', 'user', 'plain text')];
      render(
        <ChatBubble
          messages={messages}
          status={ChatStatus.Ready}
          regenerate={mockRegenerate}
        />,
      );

      // User messages shouldn't have XMarkdown in their content area
      expect(screen.queryByTestId('x-markdown')).not.toBeInTheDocument();
    });
  });

  describe('message parts concatenation', () => {
    it('concatenates text parts from multiple-parts messages', () => {
      const message = createMessage('1', 'user', 'Hello World');
      render(
        <ChatBubble
          messages={[message]}
          status={ChatStatus.Ready}
          regenerate={mockRegenerate}
        />,
      );

      expect(screen.getByTestId('bubble-content-1')).toHaveTextContent(
        'Hello World',
      );
    });

    it('renders retrieval tool summary with count and titles', () => {
      const messages = [
        {
          id: '1',
          role: 'assistant' as const,
          parts: [
            {
              type: 'tool-getInformation' as const,
              toolCallId: 'call-1',
              state: 'output-available' as const,
              input: { question: '什么是 RAG' },
              output: {
                count: 2,
                titles: ['RAG 简介', '向量检索'],
                results: [],
              },
            },
            { type: 'text' as const, text: '根据知识库…' },
          ],
          createdAt: new Date(),
        } as import('ai').UIMessage,
      ];
      render(
        <ChatBubble
          messages={messages}
          status={ChatStatus.Ready}
          regenerate={mockRegenerate}
        />,
      );
      expect(screen.getByTestId('retrieval-call')).toHaveTextContent(
        '已检索知识库（2 条）',
      );
      expect(screen.getByTestId('retrieval-call')).toHaveTextContent(
        'RAG 简介',
      );
      expect(screen.getByTestId('retrieval-call')).toHaveTextContent(
        '向量检索',
      );
      expect(screen.getByTestId('x-markdown')).toHaveTextContent('根据知识库…');
    });

    it('renders data-retrieval progress: start then hits then done', () => {
      const messages = [
        {
          id: '1',
          role: 'assistant' as const,
          parts: [
            {
              type: 'data-retrieval' as const,
              id: 'call-p',
              data: {
                type: 'start',
                toolCallId: 'call-p',
                question: '老忘带钥匙',
              },
            },
            {
              type: 'data-retrieval' as const,
              id: 'call-p-0',
              data: {
                type: 'hit',
                toolCallId: 'call-p',
                index: 0,
                hit: {
                  title: '番茄肉酱意面',
                  filename: 'a.md',
                  page: 0,
                  snippet: 's1',
                  score: 0.9,
                },
              },
            },
            {
              type: 'data-retrieval' as const,
              id: 'call-p-1',
              data: {
                type: 'hit',
                toolCallId: 'call-p',
                index: 1,
                hit: {
                  title: '今日天气',
                  filename: 'b.csv',
                  page: 0,
                  snippet: 's2',
                  score: 0.8,
                },
              },
            },
            {
              type: 'tool-getInformation' as const,
              toolCallId: 'call-p',
              state: 'input-available' as const,
              input: { question: '老忘带钥匙' },
            },
            { type: 'text' as const, text: '' },
          ],
          createdAt: new Date(),
        } as import('ai').UIMessage,
      ];
      render(
        <ChatBubble
          messages={messages}
          status={ChatStatus.Streaming}
          regenerate={mockRegenerate}
        />,
      );

      const progress = screen.getByTestId('retrieval-progress');
      expect(progress).toHaveAttribute('data-loading', 'true');
      expect(progress).toHaveTextContent('正在检索知识库…');
      expect(progress).toHaveTextContent('查询：老忘带钥匙');
      // 检索中随 hit 帧逐条展示
      expect(progress).toHaveTextContent('番茄肉酱意面');
      expect(progress).toHaveTextContent('今日天气');
      expect(screen.queryByTestId('retrieval-call')).not.toBeInTheDocument();
    });

    it('prefers data-retrieval done over tool summary (no duplicate)', () => {
      const messages = [
        {
          id: '1',
          role: 'assistant' as const,
          parts: [
            {
              type: 'data-retrieval' as const,
              id: 'call-d',
              data: {
                type: 'done',
                toolCallId: 'call-d',
                count: 2,
                titles: ['A', 'B'],
              },
            },
            {
              type: 'tool-getInformation' as const,
              toolCallId: 'call-d',
              state: 'output-available' as const,
              input: { question: 'q' },
              output: {
                count: 2,
                titles: ['A', 'B'],
                results: [],
              },
            },
            { type: 'text' as const, text: '回答正文' },
          ],
          createdAt: new Date(),
        } as import('ai').UIMessage,
      ];
      render(
        <ChatBubble
          messages={messages}
          status={ChatStatus.Ready}
          regenerate={mockRegenerate}
        />,
      );

      const progress = screen.getByTestId('retrieval-progress');
      expect(progress).toHaveAttribute('data-loading', 'false');
      expect(progress).toHaveTextContent('检索完成（2）');
      expect(progress).toHaveTextContent('A');
      expect(progress).toHaveTextContent('B');
      expect(screen.queryByTestId('retrieval-call')).not.toBeInTheDocument();
      expect(screen.getByTestId('x-markdown')).toHaveTextContent('回答正文');
    });

    it('keeps done status when hit parts appear after done (reconcile order)', () => {
      const messages = [
        {
          id: '1',
          role: 'assistant' as const,
          parts: [
            // start/done 同 id：最终只剩 done，且可能排在 hit 前面
            {
              type: 'data-retrieval' as const,
              id: 'call-r',
              data: {
                type: 'done',
                toolCallId: 'call-r',
                count: 1,
                titles: ['文档A'],
              },
            },
            {
              type: 'data-retrieval' as const,
              id: 'call-r-0',
              data: {
                type: 'hit',
                toolCallId: 'call-r',
                index: 0,
                hit: {
                  title: '文档A',
                  filename: 'a.md',
                  page: 0,
                  snippet: 's',
                  score: 0.9,
                },
              },
            },
            {
              type: 'tool-getInformation' as const,
              toolCallId: 'call-r',
              state: 'output-available' as const,
              input: { question: 'q' },
              output: {
                count: 1,
                titles: ['文档A'],
                results: [],
              },
            },
          ],
          createdAt: new Date(),
        } as import('ai').UIMessage,
      ];
      render(
        <ChatBubble
          messages={messages}
          status={ChatStatus.Ready}
          regenerate={mockRegenerate}
        />,
      );

      const progress = screen.getByTestId('retrieval-progress');
      expect(progress).toHaveAttribute('data-loading', 'false');
      expect(progress).toHaveTextContent('检索完成（1）');
      expect(progress).not.toHaveTextContent('正在检索知识库…');
    });

    it('renders separate progress blocks for parallel tool calls', () => {
      const messages = [
        {
          id: '1',
          role: 'assistant' as const,
          parts: [
            {
              type: 'data-retrieval' as const,
              id: 'c1',
              data: {
                type: 'start',
                toolCallId: 'c1',
                question: '问题一',
              },
            },
            {
              type: 'data-retrieval' as const,
              id: 'c2',
              data: {
                type: 'start',
                toolCallId: 'c2',
                question: '问题二',
              },
            },
          ],
          createdAt: new Date(),
        } as import('ai').UIMessage,
      ];
      render(
        <ChatBubble
          messages={messages}
          status={ChatStatus.Streaming}
          regenerate={mockRegenerate}
        />,
      );

      const blocks = screen.getAllByTestId('retrieval-progress');
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toHaveAttribute('data-tool-call-id', 'c1');
      expect(blocks[1]).toHaveAttribute('data-tool-call-id', 'c2');
      expect(blocks[0]).toHaveTextContent('查询：问题一');
      expect(blocks[1]).toHaveTextContent('查询：问题二');
    });
  });
});
