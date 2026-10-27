import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Header from '../Header';

// Mock useThemeStore
const mockSetTheme = jest.fn();
let mockTheme: 'light' | 'dark' = 'light';

jest.mock('../../store/useThemeStore', () => ({
  useThemeStore: (
    selector?: (state: {
      theme: string;
      setTheme: typeof mockSetTheme;
    }) => unknown,
  ) => {
    const state = { theme: mockTheme, setTheme: mockSetTheme };
    if (selector) return selector(state);
    return state;
  },
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('../../store/useUserStore', () => ({
  useUserStore: (selector?: (state: { user: null }) => unknown) => {
    const state = { user: null };
    if (selector) return selector(state);
    return state;
  },
}));

jest.mock('@myworkspace/fetch', () => ({
  apiFetch: jest.fn(),
  FetchError: class FetchError extends Error {},
}));

describe('Header', () => {
  const mockOnImport = jest.fn();
  const mockOnExport = jest.fn();

  beforeEach(() => {
    mockTheme = 'light';
    mockOnImport.mockClear();
    mockOnExport.mockClear();
    mockSetTheme.mockClear();
  });

  describe('rendering', () => {
    it('renders the title "AI Chatbot"', () => {
      render(<Header onImport={mockOnImport} onExport={mockOnExport} />);
      expect(screen.getByText('AI Chatbot')).toBeInTheDocument();
    });

    it('renders import button', () => {
      render(<Header onImport={mockOnImport} onExport={mockOnExport} />);
      expect(screen.getByText('导入会话')).toBeInTheDocument();
    });

    it('renders export button', () => {
      render(<Header onImport={mockOnImport} onExport={mockOnExport} />);
      expect(screen.getByText('导出会话')).toBeInTheDocument();
    });

    it('renders upload PDF button', () => {
      render(<Header onImport={mockOnImport} onExport={mockOnExport} />);
      expect(screen.getByText('上传PDF')).toBeInTheDocument();
    });

    it('renders theme toggle switch', () => {
      render(<Header onImport={mockOnImport} onExport={mockOnExport} />);
      const switchElement = screen.getByRole('switch');
      expect(switchElement).toBeInTheDocument();
    });
  });

  describe('theme toggle', () => {
    it('shows switch unchecked when theme is light', () => {
      mockTheme = 'light';
      render(<Header onImport={mockOnImport} onExport={mockOnExport} />);
      const switchElement = screen.getByRole('switch');
      expect(switchElement).not.toBeChecked();
    });

    it('shows switch checked when theme is dark', () => {
      mockTheme = 'dark';
      render(<Header onImport={mockOnImport} onExport={mockOnExport} />);
      const switchElement = screen.getByRole('switch');
      expect(switchElement).toBeChecked();
    });

    it('calls setTheme with dark when toggling from light', async () => {
      mockTheme = 'light';
      render(<Header onImport={mockOnImport} onExport={mockOnExport} />);

      await userEvent.click(screen.getByRole('switch'));
      expect(mockSetTheme).toHaveBeenCalledWith('dark');
    });

    it('calls setTheme with light when toggling from dark', async () => {
      mockTheme = 'dark';
      render(<Header onImport={mockOnImport} onExport={mockOnExport} />);

      await userEvent.click(screen.getByRole('switch'));
      expect(mockSetTheme).toHaveBeenCalledWith('light');
    });
  });

  describe('export button', () => {
    it('calls onExport when clicked', async () => {
      render(<Header onImport={mockOnImport} onExport={mockOnExport} />);

      await userEvent.click(screen.getByText('导出会话'));
      expect(mockOnExport).toHaveBeenCalledTimes(1);
    });
  });

  describe('import button', () => {
    it('renders with the import icon', () => {
      render(<Header onImport={mockOnImport} onExport={mockOnExport} />);
      const importButton = screen.getByText('导入会话').closest('button');
      expect(
        importButton?.querySelector('.anticon-import'),
      ).toBeInTheDocument();
    });

    it('renders export button with export icon', () => {
      render(<Header onImport={mockOnImport} onExport={mockOnExport} />);
      const exportButton = screen.getByText('导出会话').closest('button');
      expect(
        exportButton?.querySelector('.anticon-export'),
      ).toBeInTheDocument();
    });
  });
});
