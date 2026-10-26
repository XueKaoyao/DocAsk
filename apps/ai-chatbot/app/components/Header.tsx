'use client';
import { memo, useState } from 'react';
import { Avatar, Button, Popover, Switch, Upload, message } from 'antd';
import UserCard from './UserCard';
import {
  ExportOutlined,
  FileSearchOutlined,
  ImportOutlined,
  MoonOutlined,
  SunOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useThemeStore } from '../store/useThemeStore';
import { useRouter } from 'next/navigation';
import { useUserStore } from '../store/useUserStore';
import { apiFetch, FetchError } from '@myworkspace/fetch';

interface HeaderProps {
  onImport: (file: File) => void;
  onExport: () => void | Promise<void>;
}

function Header({ onImport, onExport }: HeaderProps) {
  const { theme, setTheme } = useThemeStore();
  const router = useRouter();
  const { user } = useUserStore();
  const [pdfUploading, setPdfUploading] = useState(false);

  const handlePdfUpload = async (file: File) => {
    setPdfUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await apiFetch<{
        document: { id: string; title: string };
        numpages: number;
        chars: number;
      }>('/api/file', {
        method: 'POST',
        data: form,
        cacheConfig: { ttl: 0 },
      });
      message.success(
        `「${result.document.title}」已入库：${result.numpages} 页 / ${result.chars} 字`,
      );
    } catch (error) {
      const msg =
        error instanceof FetchError
          ? error.message
          : error instanceof Error
            ? error.message
            : '上传失败';
      message.error(msg);
    } finally {
      setPdfUploading(false);
    }
  };

  return (
    <header className="shrink-0 flex items-center border-b border-secondary px-4 py-5 bg-primary">
      <Switch
        checked={theme === 'dark'}
        onChange={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        checkedChildren={<MoonOutlined />}
        unCheckedChildren={<SunOutlined />}
      />
      <Button
        className="header-button"
        icon={<FileSearchOutlined />}
        styles={{
          root: {
            backgroundColor: 'var(--color-default)',
            border: '1px solid var(--color-third)',
            color: 'var(--color-font)',
            marginLeft: '10px',
          },
        }}
        onClick={() => {
          router.push('/retrieval');
        }}
      >
        知识库检索
      </Button>
      <Upload
        accept="application/pdf,.pdf,.docx,.doc,.txt,.md,.csv"
        showUploadList={false}
        disabled={pdfUploading}
        beforeUpload={(file) => {
          void handlePdfUpload(file);
          return false;
        }}
      >
        <Button
          className="header-button"
          loading={pdfUploading}
          styles={{
            root: {
              backgroundColor: 'var(--color-default)',
              border: '1px solid var(--color-third)',
              color: 'var(--color-font)',
              marginLeft: '10px',
            },
          }}
        >
          上传PDF
        </Button>
      </Upload>
      <span className="font-semibold text-lg mx-auto text-[var(--color-font)]">
        AI Chatbot
      </span>
      <div className="flex justify-center items-center gap-5">
        <Upload accept=".json" beforeUpload={onImport} showUploadList={false}>
          <Button
            className="header-button"
            icon={<ImportOutlined />}
            styles={{
              root: {
                backgroundColor: 'var(--color-default)',
                border: '1px solid var(--color-third)',
                color: 'var(--color-font)',
              },
            }}
          >
            导入会话
          </Button>
        </Upload>
        <Button
          className="header-button"
          icon={<ExportOutlined />}
          styles={{
            root: {
              backgroundColor: 'var(--color-default)',
              border: '1px solid var(--color-third)',
              color: 'var(--color-font)',
            },
          }}
          onClick={onExport}
        >
          导出会话
        </Button>
        {user ? (
          <Popover
            content={<UserCard user={user} />}
            trigger="hover"
            placement="bottomRight"
            arrow={false}
            styles={{
              container: {
                backgroundColor: 'var(--color-primary)',
                border: '1px solid var(--color-third)',
              },
            }}
          >
            <Avatar
              size="middle"
              icon={<UserOutlined />}
              style={{
                backgroundColor: 'var(--color-default)',
                border: '1px solid var(--color-third)',
                color: 'var(--color-font)',
              }}
            />
          </Popover>
        ) : (
          <Button
            className="header-button"
            onClick={() => {
              router.push('/login');
            }}
            styles={{
              root: {
                backgroundColor: 'var(--color-default)',
                border: '1px solid var(--color-third)',
                color: 'var(--color-font)',
              },
            }}
          >
            登录/注册
          </Button>
        )}
      </div>
    </header>
  );
}

export default memo(Header);
