'use client';
import { memo, useEffect, useState } from 'react';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import type { ConversationsProps } from '@ant-design/x';
import { Conversations } from '@ant-design/x';
import type { GetProp } from 'antd';
import { Button, Input } from 'antd';
import { useSessionList } from '../store/useSessionList';
// import { deleteSessionMessages } from '../store/useMessageHistory';
import { useSystemOption } from '../store/useSystemOption';
import { usePathname, useRouter } from 'next/navigation';
import useSessionsCrud from '../hooks/useSessionsCrud';
import { useUserStore } from '../store/useUserStore';

function Sider() {
  const {
    currentSessionId,
    setCurrentSessionId,
    sessionList,
    fetchSessionList,
  } = useSessionList();
  const { defaultOption, initialPrompt, setTemperature, setSystemPrompt } =
    useSystemOption();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const router = useRouter();
  const pathname = usePathname();
  const { updateSession, deleteSession } = useSessionsCrud();
  const { user } = useUserStore();

  useEffect(() => {
    const target = sessionList.find((v) => v.id === currentSessionId);
    setTemperature(target?.temperature ?? 0.8);
    setSystemPrompt(target?.systemPrompt ?? defaultOption);
  }, [
    sessionList,
    currentSessionId,
    defaultOption,
    setTemperature,
    setSystemPrompt,
  ]);

  const handleSaveRename = async (id: string) => {
    try {
      if (!id) return;
      const trimmed =
        editTitle.trim().length > 20
          ? `${editTitle.trim().substring(0, 20)}...`
          : editTitle.trim();
      // 空标题不允许保存，直接取消编辑
      if (!trimmed) {
        setEditingId(null);
        return;
      }
      await updateSession({ id, newData: { title: trimmed } });
      await fetchSessionList(user?.id ?? '');
      // const newList = sessionList.filter((v) => v.id !== id);
      // if (target.title !== trimmed) {
      //   setSessionList([{ ...target, title: trimmed }, ...newList]);
      // }
      setEditingId(null);
    } catch (error) {
      console.error(error);
    } finally {
      setEditingId(null);
    }
  };

  const items: GetProp<ConversationsProps, 'items'> = sessionList.map(
    (session) => ({
      key: session.id,
      label:
        editingId === session.id ? (
          <Input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onPressEnter={() => handleSaveRename(session.id)}
            onBlur={() => handleSaveRename(session.id)}
            onClick={(e) => e.stopPropagation()}
            size="small"
            autoFocus
            styles={{
              root: {
                backgroundColor: 'transparent',
                border: '0px',
                color: 'var(--color-font)',
              },
            }}
          />
        ) : (
          session.title
        ),
    }),
  );

  const menuConfig: ConversationsProps['menu'] = (conversation) => ({
    items: [
      {
        label: 'Rename',
        key: 'Rename',
        icon: <EditOutlined />,
        onClick: () => {
          const id = conversation.key;
          setEditingId(id);
          setEditTitle(conversation.label as string);
          // setEditTitle(sessionList.find((s) => s.id === id)?.title || '');
        },
      },
      {
        label: 'Delete Chat',
        key: 'deleteChat',
        icon: <DeleteOutlined />,
        danger: true,
        onClick: async () => {
          const deletedId = conversation.key;
          await deleteSession(deletedId);
          await fetchSessionList(user?.id ?? '');
          // const newSessionList = sessionList.filter((v) => v.id !== deletedId);
          // setSessionList(newSessionList);
          // deleteSessionMessages(deletedId);
          if (currentSessionId === deletedId) {
            setCurrentSessionId(null);
            initialPrompt();
          }
        },
      },
    ],
  });

  const newChatClick = () => {
    router.push('/');
    setCurrentSessionId(null);
    initialPrompt();
  };

  return (
    <div className="w-full h-full bg-[var(--color-primary)] border-r border-[var(--color-secondary)] overflow-y-auto scrollbar-none">
      <Button
        styles={{
          root: {
            backgroundColor: 'var(--error-bg)',
            borderColor: 'var(--error-border)',
            color: 'var(--error-text)',
            marginLeft: '12px',
            marginRight: '12px',
            marginTop: '15px',
            width: 'calc(100% - 24px)',
            padding: '15px 10px',
          },
        }}
        icon={<DeleteOutlined />}
        onClick={() => {
          router.push('/garbage');
        }}
      >
        回收站
      </Button>
      <Conversations
        menu={menuConfig}
        items={items}
        className="sider-conversations"
        creation={{
          onClick: newChatClick,
        }}
        activeKey={String(currentSessionId)}
        onActiveChange={(v) => {
          setCurrentSessionId(v);
          if (pathname !== '/') {
            router.push('/');
          }
        }}
        styles={{
          item: {
            borderRadius: 50,
            marginBottom: 5,
            padding: '8px 15px',
          },
          creation: {
            backgroundColor: 'var(--color-default)',
            borderColor: 'var(--color-third)',
            color: 'var(--color-font)',
            marginBottom: 10,
            marginTop: 5,
          },
        }}
      />
    </div>
  );
}

export default memo(Sider);
