import { describe, expect, it } from 'vitest';
import { createOpenAiEmbeddings, EMBEDDING_DIMENSIONS, EmbeddingsError } from './embeddings';

const vec = (seed: number) =>
  Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? seed : 0));
const ok = (inputs: number, tokens = 10) =>
  new Response(
    JSON.stringify({
      // out of order on purpose
      data: Array.from({ length: inputs }, (_, i) => ({ index: i, embedding: vec(i) })).reverse(),
      usage: { prompt_tokens: tokens },
    }),
    { status: 200 },
  );

function fakeFetch(...responses: (Response | Error)[]) {
  const calls: { url: string; body: { model: string; input: string[]; dimensions: number } }[] = [];
  const queue = [...responses];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(init.body as string) });
    const next = queue.shift();
    if (!next) throw new Error('no response scripted');
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe('OpenAI-compatible embeddings provider', () => {
  it('sends the configured model and 1536 dimensions, orders vectors by index and sums tokens', async () => {
    const { f, calls } = fakeFetch(ok(2, 7));
    const p = createOpenAiEmbeddings({ apiKey: 'k', model: 'embed-test', fetch: f, retries: 0 });
    const r = await p.embed(['a', 'b']);
    expect(calls[0]).toMatchObject({
      url: 'https://api.openai.com/v1/embeddings',
      body: { model: 'embed-test', dimensions: 1536, input: ['a', 'b'] },
    });
    expect(r.vectors.map((v) => v[0])).toEqual([0, 1]);
    expect(r.tokens).toBe(7);
    expect(p.model).toBe('embed-test');
  });

  it('batches large inputs', async () => {
    const { f, calls } = fakeFetch(ok(64, 1), ok(6, 1));
    const p = createOpenAiEmbeddings({
      apiKey: 'k',
      model: 'm',
      fetch: f,
      retries: 0,
      baseUrl: 'http://x/v1/',
    });
    const r = await p.embed(Array.from({ length: 70 }, (_, i) => `t${i}`));
    expect(calls.map((c) => c.body.input.length)).toEqual([64, 6]);
    expect(calls[0]!.url).toBe('http://x/v1/embeddings');
    expect(r.vectors).toHaveLength(70);
    expect(r.tokens).toBe(2);
  });

  it('retries 429/5xx and network errors, then gives a retryable error', async () => {
    const { f, calls } = fakeFetch(new Response('', { status: 503 }), new Error('socket'), ok(1));
    const p = createOpenAiEmbeddings({ apiKey: 'k', model: 'm', fetch: f, retries: 2 });
    expect((await p.embed(['a'])).vectors).toHaveLength(1);
    expect(calls).toHaveLength(3);

    const fail = fakeFetch(new Response('', { status: 429 }));
    const q = createOpenAiEmbeddings({ apiKey: 'k', model: 'm', fetch: fail.f, retries: 0 });
    await expect(q.embed(['a'])).rejects.toMatchObject({ retryable: true });
  });

  it('does not retry client errors, wrong dimensions or malformed answers', async () => {
    const bad = fakeFetch(new Response('', { status: 401 }));
    await expect(
      createOpenAiEmbeddings({ apiKey: 'k', model: 'm', fetch: bad.f }).embed(['a']),
    ).rejects.toMatchObject({ retryable: false });
    expect(bad.calls).toHaveLength(1);

    const dims = fakeFetch(
      new Response(JSON.stringify({ data: [{ index: 0, embedding: [1, 2, 3] }] }), { status: 200 }),
    );
    await expect(
      createOpenAiEmbeddings({ apiKey: 'k', model: 'm', fetch: dims.f }).embed(['a']),
    ).rejects.toThrow(/3 dimensions, expected 1536/);

    const shape = fakeFetch(new Response('{"oops":1}', { status: 200 }));
    await expect(
      createOpenAiEmbeddings({ apiKey: 'k', model: 'm', fetch: shape.f }).embed(['a']),
    ).rejects.toBeInstanceOf(EmbeddingsError);
  });
});
