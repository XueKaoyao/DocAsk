'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Typography,
  message,
} from 'antd';
import type { TableColumnsType } from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useDocumentCrud } from '../hooks/useDocumentCrud';
import type {
  DocumentResponse,
  DocumentWriteInput,
} from '../types/DocumentsType';

type FormValues = {
  title: string;
  filename?: string;
  content: string;
};

function formatTime(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function DocumentsPage() {
  const {
    getDocuments,
    createDocument,
    updateDocument,
    deleteDocument,
    deleteDocuments,
  } = useDocumentCrud();

  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentResponse | null>(null);
  const [viewing, setViewing] = useState<DocumentResponse | null>(null);
  const [form] = Form.useForm<FormValues>();

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getDocuments();
      setDocuments(list);
      setSelectedRowKeys([]);
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : '加载文档列表失败',
      );
    } finally {
      setLoading(false);
    }
  }, [getDocuments]);

  useEffect(() => {
    let cancelled = false;
    getDocuments()
      .then((list) => {
        if (cancelled) return;
        setDocuments(list);
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

  const openCreate = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = (doc: DocumentResponse) => {
    setEditing(doc);
    setEditorOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const payload: DocumentWriteInput = {
        title: values.title.trim(),
        content: values.content.trim(),
        filename: values.filename?.trim() || undefined,
      };

      if (editing) {
        await updateDocument({ id: editing.id, ...payload });
        message.success('文档已更新（向量已重建）');
      } else {
        await createDocument(payload);
        message.success('文档已创建并入库');
      }

      setEditorOpen(false);
      setEditing(null);
      form.resetFields();
      await loadDocuments();
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        return;
      }
      message.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOne = async (id: string) => {
    try {
      await deleteDocument(id);
      message.success('已删除');
      await loadDocuments();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除失败');
    }
  };

  const handleDeleteMany = async () => {
    const ids = selectedRowKeys.map(String);
    if (ids.length === 0) return;
    try {
      await deleteDocuments(ids);
      message.success(`已删除 ${ids.length} 条`);
      await loadDocuments();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '批量删除失败');
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
      width: 180,
      render: (text: string) => text.replace(/\s+/g, ' ').slice(0, 80),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 120,
      render: (value: string) => formatTime(value),
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
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
            icon={<EditOutlined />}
            onClick={() => openEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除该文档？"
            description="将同时清理向量索引"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => void handleDeleteOne(record.id)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
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
            知识库文档
          </h1>
          <p className="mt-2 mb-0 text-sm text-[var(--color-placeholder)]">
            管理 Document 全文与向量索引（增删改查）
          </p>
        </div>
        <Space wrap>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void loadDocuments()}
            loading={loading}
            className="header-button"
            styles={{
              root: {
                backgroundColor: 'var(--color-default)',
                border: '1px solid var(--color-third)',
                color: 'var(--color-font)',
                marginLeft: '10px',
              },
            }}
          >
            刷新
          </Button>
          <Popconfirm
            title={`确认删除选中的 ${selectedRowKeys.length} 条？`}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            disabled={selectedRowKeys.length === 0}
            onConfirm={() => void handleDeleteMany()}
          >
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={selectedRowKeys.length === 0}
              className="header-button"
              styles={{
                root: {
                  backgroundColor: 'var(--color-default)',
                  border: '1px solid var(--color-third)',
                  color: 'var(--color-font)',
                  marginLeft: '10px',
                },
              }}
            >
              批量删除
            </Button>
          </Popconfirm>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreate}
            className="header-button"
            styles={{
              root: {
                backgroundColor: 'var(--color-default)',
                border: '1px solid var(--color-third)',
                color: 'var(--color-font)',
                marginLeft: '10px',
              },
            }}
          >
            新建文档
          </Button>
        </Space>
      </div>

      <Table<DocumentResponse>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={documents}
        scroll={{ x: 900 }}
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
        }}
        locale={{ emptyText: '暂无文档，可新建或通过 Header 上传 PDF' }}
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

      <Modal
        title={editing ? '编辑文档' : '新建文档'}
        open={editorOpen}
        onCancel={() => {
          setEditorOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        onOk={() => void handleSubmit()}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        width={720}
        destroyOnHidden
      >
        <Form<FormValues> form={form} layout="vertical" className="mt-4">
          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: '请输入标题' }]}
          >
            <Input placeholder="文档标题" />
          </Form.Item>
          <Form.Item name="filename" label="文件名">
            <Input placeholder="可选，默认与标题相同" />
          </Form.Item>
          <Form.Item
            name="content"
            label="正文"
            rules={[{ required: true, message: '请输入正文' }]}
          >
            <Input.TextArea
              placeholder="文档正文，保存后会重新切块并写入向量库"
              autoSize={{ minRows: 8, maxRows: 20 }}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={viewing?.title}
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
                更新时间
              </Typography.Text>
              <div>{formatTime(viewing.updatedAt)}</div>
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
