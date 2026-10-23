import type Anthropic from '@anthropic-ai/sdk';
import type { LlmClient } from '../src';

type Block = Anthropic.ContentBlock;
type Step =
  | Anthropic.Message
  | Error
  | ((params: Anthropic.MessageCreateParamsNonStreaming) => Anthropic.Message);

let counter = 0;

export function message(
  content: Block[],
  options: { stop?: Anthropic.StopReason; usage?: Partial<Anthropic.Usage> } = {},
): Anthropic.Message {
  counter += 1;
  return {
    id: `msg_${counter}`,
    type: 'message',
    role: 'assistant',
    model: 'test-model',
    content,
    stop_reason:
      options.stop ?? (content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn'),
    stop_sequence: null,
    usage: {
      input_tokens: 1000,
      output_tokens: 100,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      ...options.usage,
    },
  } as unknown as Anthropic.Message;
}

export const toolUse = (name: string, input: unknown, id = `toolu_${++counter}`): Block =>
  ({ type: 'tool_use', id, name, input }) as unknown as Block;

export const text = (value: string): Block =>
  ({ type: 'text', text: value, citations: null }) as unknown as Block;

/** Scripted model: each call returns the next step; calls are recorded for assertions. */
export function createFakeLlm(steps: Step[] = []) {
  const queue = [...steps];
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const llm: LlmClient = {
    async create(params) {
      // Snapshot: the engine keeps appending to the same messages array.
      calls.push(structuredClone(params));
      const step = queue.shift();
      if (!step) throw new Error('fake llm: no more scripted responses');
      if (step instanceof Error) throw step;
      return typeof step === 'function' ? step(params) : step;
    },
  };
  return {
    llm,
    calls,
    script: (...more: Step[]) => queue.push(...more),
    remaining: () => queue.length,
  };
}
