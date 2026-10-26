import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from 'ai';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { requireAuth } from '@/app/lib/requireAuth';
import { createChatTranscript } from '@/app/lib/chatTranscript';
import { createRetrievalTools } from '@/app/tools/retrievalTool';
import {
  toRetrievalDataPart,
  type AppDataParts,
} from '@/app/types/RetrievalType';

const deepseek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash';

const RAG_SYSTEM_APPENDIX = `先调用 getInformation 工具查询知识库，再回答用户问题。
只依据工具返回的信息作答，不要编造知识库中不存在的内容。
若工具未找到相关内容（count 为 0 或 results 为空），请明确告知用户：知识库中没有相关信息。`;

type AppUIMessage = UIMessage<never, AppDataParts>;

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const { messages, temperature, systemPrompt } = await request.json();

    const system = [systemPrompt, RAG_SYSTEM_APPENDIX]
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .join('\n\n');

    const transcript = await createChatTranscript({
      userId: auth.user?.id,
      model: DEEPSEEK_MODEL,
    });

    const modelMessages = await convertToModelMessages(messages);

    await transcript.append('request', {
      model: DEEPSEEK_MODEL,
      temperature,
      system,
      messageCount: Array.isArray(messages) ? messages.length : 0,
      messages,
      modelMessages,
      logFiles: {
        jsonl: transcript.jsonlPath,
        text: transcript.textPath,
      },
    });

    console.info('[chat] transcript', transcript.id, transcript.textPath);

    // 方案 2：外层 createUIMessageStream 写 data-retrieval；内层 merge 模型/工具 UI 流
    // 不传 originalMessages、不关 sendStart：落库在客户端 onFinish；
    // data-retrieval 在 tool execute 期间写入，此时 message start 已由 toUIMessageStream 发出。
    const stream = createUIMessageStream<AppUIMessage>({
      execute: async ({ writer }) => {
        const result = streamText({
          model: deepseek(DEEPSEEK_MODEL),
          messages: modelMessages,
          temperature,
          system,
          tools: createRetrievalTools((event) => {
            writer.write(toRetrievalDataPart(event));
          }),
          stopWhen: stepCountIs(5),
          maxRetries: 1,
          // 不记 chunk 流（tool-input-delta 等过于细碎）；以 step / finish 汇总为准
          onStepFinish: async (step) => {
            await transcript
              .append('step.finish', {
                finishReason: step.finishReason,
                text: step.text,
                toolCalls: step.toolCalls,
                toolResults: step.toolResults,
                usage: step.usage,
                // reasoning / sources 若存在一并记下
                ...(step.reasoning != null
                  ? { reasoning: step.reasoning }
                  : {}),
              })
              .catch((err) => {
                console.warn('[chat] transcript step log failed:', err);
              });
          },
          onFinish: async (event) => {
            await transcript
              .append('response.finish', {
                finishReason: event.finishReason,
                text: event.text,
                totalUsage: event.totalUsage,
                steps: event.steps?.map((s, i) => ({
                  index: i,
                  finishReason: s.finishReason,
                  text: s.text,
                  toolCalls: s.toolCalls,
                  toolResults: s.toolResults,
                })),
              })
              .catch((err) => {
                console.warn('[chat] transcript finish log failed:', err);
              });
          },
        });

        writer.merge(result.toUIMessageStream());
      },
    });

    return createUIMessageStreamResponse({ stream });

    // —— 原逻辑（直接 toUIMessageStreamResponse，无 data-retrieval）：保留对照，勿删 ——
    // const result = streamText({
    //   model: deepseek(DEEPSEEK_MODEL),
    //   messages: modelMessages,
    //   temperature,
    //   system,
    //   tools: retrievalTools,
    //   stopWhen: stepCountIs(5),
    //   maxRetries: 1,
    //   onStepFinish: async (step) => { /* transcript step.finish */ },
    //   onFinish: async (event) => { /* transcript response.finish */ },
    // });
    // return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error('Error in API route:', error);
    return new Response(JSON.stringify({ text: '请求失败，请稍后再试。' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
