/** A stand-in for graph.facebook.com and the media CDN, recording every call. */
export type GraphCall = { method: string; url: string; body: unknown };

export function createFakeGraph() {
  const calls: GraphCall[] = [];
  let sent = 0;
  const state = {
    mediaFails: false,
    sendError: null as null | { status: number; code: number; message: string },
    media: new Map<string, { mime: string; bytes: Buffer }>(),
  };

  const fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = (init.method ?? 'GET').toUpperCase();
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({ method, url, body });
    const json = (status: number, data: unknown) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json' },
      });

    const cdn = /^https:\/\/cdn\.test\/(.+)$/.exec(url);
    if (cdn) {
      if (state.mediaFails) return new Response('boom', { status: 500 });
      const media = state.media.get(cdn[1]!);
      return media
        ? new Response(new Uint8Array(media.bytes), { status: 200 })
        : new Response('nf', { status: 404 });
    }
    const path = new URL(url).pathname.split('/').slice(2).join('/');
    if (method === 'POST' && path.endsWith('/messages')) {
      if (state.sendError) {
        return json(state.sendError.status, {
          error: { code: state.sendError.code, message: state.sendError.message },
        });
      }
      sent += 1;
      return json(200, { messages: [{ id: `wamid.out-${sent}-${Date.now()}` }] });
    }
    if (method === 'GET' && state.media.has(path)) {
      const media = state.media.get(path)!;
      return json(200, {
        url: `https://cdn.test/${path}`,
        mime_type: media.mime,
        sha256: 'x',
        file_size: media.bytes.length,
      });
    }
    return json(404, { error: { code: 100, message: `unexpected ${method} ${url}` } });
  };

  return { fetch: fetch, calls, state, sends: () => calls.filter((c) => c.method === 'POST') };
}
