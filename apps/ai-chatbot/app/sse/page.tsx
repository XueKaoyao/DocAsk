'use client';

import { useEffect, useState } from 'react';

export default function SSEPage() {
  const [answer, setAnswer] = useState('');

  useEffect(() => {
    const eventSource = new EventSource('/api/rag-stream');

    // 接收 token 事件
    eventSource.addEventListener('token', (event) => {
      const token = JSON.parse(event.data);

      setAnswer((prev) => prev + token);
    });

    // 接收 done 事件
    eventSource.addEventListener('done', (event) => {
      const data = JSON.parse(event.data);

      console.log('生成完成:', data);

      eventSource.close();
    });

    // 连接错误
    eventSource.onerror = (error) => {
      console.error('SSE 连接错误:', error);

      eventSource.close();
    };

    // 组件卸载时关闭连接
    return () => {
      eventSource.close();
    };
  }, []);

  return (
    <div>
      <h2>AI 回答：</h2>
      <p>{answer}</p>
    </div>
  );
}
