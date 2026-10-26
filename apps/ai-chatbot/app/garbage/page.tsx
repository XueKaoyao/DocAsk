'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Drawer,
  Popconfirm,
  Space,
  Table,
  Typography,
  message,
} from 'antd';
import type { TableColumnsType } from 'antd';
import {
  DeleteOutlined,
  EyeOutlined,
  ReloadOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { useDocumentCrud } from '../hooks/useDocumentCrud';
import type { DocumentResponse } from '../types/DocumentsType';

function formatTime(value: string | null | undefined) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

const btnStyles = {
  root: {
    backgroundColor: 'var(--color-default)',
    border: '1px solid var(--color-third)',
    color: 'var(--color-font)',
  },
};

export default function GarbagePage() {
  const {
    getDeletedDocuments,
    restoreDocument,
    deleteDocument,
    deleteDocuments,
  } = useDocumentCrud();

  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [viewing, setViewing] = useState<DocumentResponse | null>(null);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getDeletedDocuments();
      setDocuments(list);
      setSelectedRowKeys([]);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载回收站失败');
    } finally {
      setLoading(false);
    }
  }, [getDeletedDocuments]);

  useEffect(() => {
    let cancelled = false;
    getDeletedDocuments()
      .then((list) => {
        if (cancelled) return;
        setDocuments(list);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        message.error(
          error instanceof Error ? error.message : '加载回收站失败',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [getDeletedDocuments]);

  const handleRestore = async (id: string) => {
    try {
      await restoreDocument(id);
      message.success('已恢复到知识库');
      await loadDocuments();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '恢复失败');
    }
  };

  const handleHardDelete = async (id: string) => {
    try {
      // 回收站内再删一次 → 硬删除
      await deleteDocument(id);
      message.success('已彻底删除');
      await loadDocuments();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '彻底删除失败');
    }
  };

  const handleHardDeleteMany = async () => {
    const ids = selectedRowKeys.map(String);
    if (ids.length === 0) return;
    try {
      // deleteDocuments 走硬删；回收站条目已是软删状态
      await deleteDocuments(ids);
      message.success(`已彻底删除 ${ids.length} 条`);
      await loadDocuments();
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : '批量彻底删除失败',
      );
    }
  };

  const columns: TableColumnsType<DocumentResponse> = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      width: 120,
    },
    {
      title: '文件名',
      dataIndex: 'filename',
      key: 'filename',
      ellipsis: true,
      width: 120,
    },
    {
      title: '内容预览',
      dataIndex: 'content',
      key: 'content',
      ellipsis: true,
      width: 150,
      render: (text: string) => text.replace(/\s+/g, ' ').slice(0, 80),
    },
    {
      title: '删除时间',
      dataIndex: 'deletedAt',
      key: 'deletedAt',
      width: 150,
      render: (value: string | null) => formatTime(value),
    },
    {
      title: '操作',
      key: 'actions',
      width: 240,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setViewing(record)}
          >
            查看
          </Button>
          <Button
            type="link"
            size="small"
            icon={<UndoOutlined />}
            onClick={() => void handleRestore(record.id)}
          >
            恢复
          </Button>
          <Popconfirm
            title="确认彻底删除？"
            description="不可恢复，将从数据库移除"
            okText="彻底删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => void handleHardDelete(record.id)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              彻底删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full max-w-5xl px-10 mx-auto overflow-y-auto scrollbar-none my-6">
      <div className="shrink-0 pb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-font)] m-0">
            回收站
          </h1>
          <p className="mt-2 mb-0 text-sm text-[var(--color-placeholder)]">
            展示已软删除的文档，可恢复或彻底删除
          </p>
        </div>
        <Space wrap>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void loadDocuments()}
            loading={loading}
            className="header-button"
            styles={btnStyles}
          >
            刷新
          </Button>
          <Popconfirm
            title={`确认彻底删除选中的 ${selectedRowKeys.length} 条？`}
            okText="彻底删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            disabled={selectedRowKeys.length === 0}
            onConfirm={() => void handleHardDeleteMany()}
          >
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={selectedRowKeys.length === 0}
              className="header-button"
              styles={btnStyles}
            >
              批量彻底删除
            </Button>
          </Popconfirm>
        </Space>
      </div>

      <Table<DocumentResponse>
        rowKey="id"
        pagination={false}
        loading={loading}
        columns={columns}
        dataSource={documents}
        scroll={{ x: 900 }}
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
        }}
        locale={{ emptyText: '回收站为空' }}
        className="docs-table"
        styles={{
          header: {
            cell: {
              backgroundColor: 'var(--color-secondary)',
              color: 'var(--color-font)',
            },
          },
          body: {
            cell: {
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-font)',
            },
            wrapper: {
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-font)',
            },
          },
          pagination: {
            item: {
              backgroundColor: 'var(--color-fontbg)',
              color: 'var(--color-font)',
            },
          },
        }}
      />

      <Drawer
        title={viewing?.title ?? '文档详情'}
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        size={560}
        styles={{
          header: {
            backgroundColor: 'var(--color-primary)',
            color: 'var(--color-font)',
          },
          body: {
            backgroundColor: 'var(--color-primary)',
            color: 'var(--color-font)',
          },
        }}
      >
        {viewing && (
          <div className="flex flex-col gap-3 text-[var(--color-font)]">
            <div>
              <Typography.Text
                type="secondary"
                styles={{
                  root: {
                    color: 'var(--color-font)',
                    fontSize: '16px',
                    fontWeight: 'bold',
                  },
                }}
              >
                文件名
              </Typography.Text>
              <div>{viewing.filename}</div>
            </div>
            <div>
              <Typography.Text
                type="secondary"
                styles={{
                  root: {
                    color: 'var(--color-font)',
                    fontSize: '16px',
                    fontWeight: 'bold',
                  },
                }}
              >
                删除时间
              </Typography.Text>
              <div>{formatTime(viewing.deletedAt)}</div>
            </div>
            <div>
              <Typography.Text
                type="secondary"
                styles={{
                  root: {
                    color: 'var(--color-font)',
                    fontSize: '16px',
                    fontWeight: 'bold',
                  },
                }}
              >
                正文
              </Typography.Text>
              <Typography.Paragraph
                className="!mt-2 whitespace-pre-wrap"
                styles={{
                  root: {
                    color: 'var(--color-font)',
                  },
                }}
              >
                {viewing.content}
              </Typography.Paragraph>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
