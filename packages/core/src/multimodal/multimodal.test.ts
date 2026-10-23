import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createFakeLlm, message, text } from '../../tests/fake-llm';
import { parsePricing } from '../agents/pricing';
import { createGroqTranscriber, MAX_AUDIO_BYTES, TranscriptionError } from './transcribe';
import { assertHasConfidence, extractFromImage, MAX_IMAGE_BYTES, VisionError } from './vision';

describe('Groq Whisper transcriber', () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  const make = (response: Response | Error) => {
    const calls: { url: string; form: FormData; auth: string | null }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push({
        url,
        form: init.body as FormData,
        auth: new Headers(init.headers).get('authorization'),
      });
      if (response instanceof Error) throw response;
      return response;
    }) as unknown as typeof fetch;
    return { f, calls };
  };
  const audio = { data: new Uint8Array([1, 2, 3]), filename: 'voz.ogg', mime: 'audio/ogg' };

  it('sends the file with the configured model, Portuguese and zero temperature', async () => {
    const { f, calls } = make(
      ok({ text: ' Cheguei no cliente. ', duration: 4.2, language: 'portuguese' }),
    );
    const t = createGroqTranscriber({ apiKey: 'k', model: 'whisper-test', fetch: f });
    expect(await t.transcribe(audio)).toEqual({
      text: 'Cheguei no cliente.',
      durationSeconds: 4.2,
      language: 'portuguese',
    });
    expect(calls[0]!.url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    expect(calls[0]!.auth).toBe('Bearer k');
    expect(calls[0]!.form.get('model')).toBe('whisper-test');
    expect(calls[0]!.form.get('language')).toBe('pt');
    expect(calls[0]!.form.get('temperature')).toBe('0');
    expect((calls[0]!.form.get('file') as File).name).toBe('voz.ogg');
    expect(t.model).toBe('whisper-test');
  });

  it('marks outages and rate limits retryable, and everything else permanent', async () => {
    for (const [response, retryable] of [
      [new Response('', { status: 503 }), true],
      [new Response('', { status: 429 }), true],
      [new Error('socket'), true],
      [new Response('', { status: 400 }), false],
      [new Response('{"nope":1}', { status: 200 }), false],
    ] as const) {
      const { f } = make(response);
      const t = createGroqTranscriber({ apiKey: 'k', model: 'm', fetch: f });
      await expect(t.transcribe(audio)).rejects.toMatchObject({
        name: 'TranscriptionError',
        retryable,
      });
    }
  });

  it('refuses files above the provider limit without calling it', async () => {
    const { f, calls } = make(ok({ text: 'x' }));
    const t = createGroqTranscriber({ apiKey: 'k', model: 'm', fetch: f });
    await expect(
      t.transcribe({ ...audio, data: new Uint8Array(MAX_AUDIO_BYTES + 1) }),
    ).rejects.toBeInstanceOf(TranscriptionError);
    expect(calls).toHaveLength(0);
  });
});

describe('vision extraction (CLAUDE.md rule 6)', () => {
  const reading = z.object({
    celsius: z.number().min(-80).max(60).nullable(),
    confidence: z.number().min(0).max(1),
    note: z.string().max(200).optional(),
  });
  const deps = (fake: ReturnType<typeof createFakeLlm>) => ({
    llm: fake.llm,
    models: { agent: 'a', fast: 'f', vision: 'test-model-vision' },
    pricing: parsePricing('{"test-model-vision":{"input":2,"output":10}}'),
  });
  const png = { data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), mime: 'image/png' };

  it('refuses a schema without a required confidence', () => {
    expect(() => assertHasConfidence(z.object({ celsius: z.number() }))).toThrow(/confidence/);
    expect(() =>
      assertHasConfidence(z.object({ celsius: z.number(), confidence: z.number().optional() })),
    ).toThrow(/confidence/);
    expect(() => assertHasConfidence(reading)).not.toThrow();
  });

  it('sends the image and the schema (without keywords the API lacks) to the vision model and validates the answer', async () => {
    const fake = createFakeLlm([
      message([text('{"celsius":4.2,"confidence":0.91}')], {
        usage: { input_tokens: 1500, output_tokens: 40 },
      }),
    ]);
    const result = await extractFromImage(deps(fake), {
      schema: reading,
      instruction: 'Leia o termômetro.',
      image: png,
    });
    expect(result.data).toEqual({ celsius: 4.2, confidence: 0.91 });
    expect(result.model).toBe('test-model-vision');
    expect(result.costUsd).toBeCloseTo((1500 * 2 + 40 * 10) / 1e6, 8);

    const call = fake.calls[0]!;
    expect(call.model).toBe('test-model-vision');
    const content = call.messages[0]!.content as {
      type: string;
      source?: { type: string; media_type: string; data: string };
      text?: string;
    }[];
    expect(content[0]).toMatchObject({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: Buffer.from(png.data).toString('base64'),
      },
    });
    expect(content[1]).toEqual({ type: 'text', text: 'Leia o termômetro.' });
    const schema = (call.output_config!.format as { schema: Record<string, unknown> } | undefined)!
      .schema as { additionalProperties: boolean; required: string[] };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toContain('confidence');
    expect(JSON.stringify(schema)).not.toMatch(/"(minimum|maximum|maxLength)"/);
  });

  it('rejects output that breaks the schema or its limits (zod still enforces them)', async () => {
    for (const bad of [
      'not json',
      '{"celsius":4.2}',
      '{"celsius":900,"confidence":0.9}',
      '{"celsius":4,"confidence":3}',
    ]) {
      const fake = createFakeLlm([message([text(bad)])]);
      await expect(
        extractFromImage(deps(fake), { schema: reading, instruction: 'x', image: png }),
      ).rejects.toMatchObject({ code: 'invalid_output' });
    }
  });

  it('refuses unsupported or huge images and model refusals before/after the call', async () => {
    const fake = createFakeLlm([message([], { stop: 'refusal' })]);
    await expect(
      extractFromImage(deps(fake), {
        schema: reading,
        instruction: 'x',
        image: { data: png.data, mime: 'application/pdf' },
      }),
    ).rejects.toMatchObject({ code: 'unsupported_image' });
    await expect(
      extractFromImage(deps(fake), {
        schema: reading,
        instruction: 'x',
        image: { data: new Uint8Array(MAX_IMAGE_BYTES + 1), mime: 'image/jpeg' },
      }),
    ).rejects.toMatchObject({ code: 'image_too_large' });
    expect(fake.calls).toHaveLength(0);
    await expect(
      extractFromImage(deps(fake), { schema: reading, instruction: 'x', image: png }),
    ).rejects.toBeInstanceOf(VisionError);
  });
});
