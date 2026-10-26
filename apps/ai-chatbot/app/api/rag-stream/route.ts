export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        const frame = `event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`;

        controller.enqueue(encoder.encode(frame));
      };

      send('token', '你');

      setTimeout(() => {
        send('token', '好');
      }, 1000);

      setTimeout(() => {
        send('token', '，我是');
      }, 2000);

      setTimeout(() => {
        send('token', 'AI');
      }, 3000);

      setTimeout(() => {
        send('done', true);
        controller.close();
      }, 4000);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
