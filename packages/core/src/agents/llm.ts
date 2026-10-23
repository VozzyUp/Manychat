import Anthropic from '@anthropic-ai/sdk';

/**
 * The one seam to the model. Production uses the official SDK; tests pass a fake.
 * Model ids never appear in code: callers read them from LLM_MODEL_* (CLAUDE.md rule 5).
 */
export type LlmClient = {
  create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
};

/** Official SDK client. The SDK retries 408/409/429/5xx and connection errors (2 times). */
export function createAnthropicClient(options: {
  apiKey: string;
  timeoutMs?: number;
  maxRetries?: number;
}): LlmClient {
  const client = new Anthropic({
    apiKey: options.apiKey,
    timeout: options.timeoutMs ?? 60_000,
    maxRetries: options.maxRetries ?? 2,
  });
  return { create: (params) => client.messages.create(params) };
}

export type ModelNames = { agent: string; fast: string; vision: string };

export function usageOf(message: Anthropic.Message) {
  return {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
  };
}
