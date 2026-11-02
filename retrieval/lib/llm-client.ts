import { MODELS_CONFIG } from '../config/models.config';
import { withRetry } from './retry';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ZaiChatResponse {
  choices?: { message?: { content?: string | null } }[];
}

// Коннектор к chat-completions z.ai. Позже переиспользуется ассистентом
// для основной модели.
export async function chatCompletion(messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env[MODELS_CONFIG.env.zaiKey];
  if (!apiKey) {
    throw new Error(
      `${MODELS_CONFIG.env.zaiKey} is not set (.env.local) — нужен для вызова ${MODELS_CONFIG.llmModel}`,
    );
  }

  return withRetry('z.ai chat completion', async () => {
    const res = await fetch(MODELS_CONFIG.zaiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODELS_CONFIG.llmModel,
        messages,
        // GLM-5.3: thinking.type обязан быть 'enabled', глубина — reasoning_effort
        thinking: { type: 'enabled' },
        reasoning_effort: MODELS_CONFIG.llmReasoningEffort,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`z.ai API ${res.status}: ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as ZaiChatResponse;
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error('z.ai API вернул пустой ответ');
    return content;
  });
}
