// Fake WhatsApp Graph API, Anthropic Messages API and embeddings endpoint for end-to-end tests
// (never talks to Meta, Anthropic or an embeddings provider).
// Tokens starting with "EAAG-valid" are accepted; anything else gets error 190.
import { createServer } from 'node:http';

const port = Number(process.env.FAKE_GRAPH_PORT ?? 4900);

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data ? JSON.parse(data) : {}));
  });

const DIMS = 1536;
const axisVector = (axis) => Array.from({ length: DIMS }, (_, i) => (i === axis ? 1 : 0));

/** Embeddings: texts that say "impossivel" point away from the seeded chunk (axis 0). */
function embeddings(body) {
  const input = Array.isArray(body.input) ? body.input : [body.input];
  return {
    data: input.map((text, index) => ({
      index,
      embedding: axisVector(/imposs[ií]vel/i.test(String(text)) ? 1 : 0),
    })),
    usage: { prompt_tokens: input.length * 10 },
  };
}

const message = (content) => ({
  id: `msg_fake${Date.now()}`,
  type: 'message',
  role: 'assistant',
  model: 'e2e-agent',
  content,
  stop_reason: 'tool_use',
  stop_sequence: null,
  usage: {
    input_tokens: 1000,
    output_tokens: 100,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  },
});

/** Anthropic: search first; then reply citing the first result, or hand off when nothing was found. */
function anthropic(body) {
  const last = body.messages[body.messages.length - 1];
  const result = Array.isArray(last.content)
    ? last.content.find((b) => b.type === 'tool_result')
    : undefined;
  if (!result) {
    const question = body.messages[0].content;
    return message([
      {
        type: 'tool_use',
        id: 'toolu_s',
        name: 'search_knowledge',
        input: { query: String(question) },
      },
    ]);
  }
  const found = JSON.parse(result.content);
  const first = found.results?.[0];
  if (!first) {
    return message([
      {
        type: 'tool_use',
        id: 'toolu_h',
        name: 'handoff_to_human',
        input: { reason: 'no_knowledge', summary: 'Sem base.' },
      },
    ]);
  }
  return message([
    {
      type: 'tool_use',
      id: 'toolu_r',
      name: 'reply',
      input: {
        kind: 'informative',
        text: 'A temperatura deve ficar entre 2 e 8 °C.',
        chunk_ids: [first.chunk_id],
      },
    },
  ]);
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  if (url.pathname === '/health') return send(res, 200, { ok: true });
  if (req.method === 'POST' && url.pathname === '/v1/embeddings')
    return send(res, 200, embeddings(await readBody(req)));
  if (req.method === 'POST' && url.pathname === '/v1/messages')
    return send(res, 200, anthropic(await readBody(req)));
  const auth = req.headers.authorization ?? '';
  if (!auth.startsWith('Bearer EAAG-valid')) {
    return send(res, 401, { error: { code: 190, message: 'Invalid OAuth access token' } });
  }
  if (url.pathname.endsWith('/message_templates')) {
    return send(res, 200, {
      data: [
        {
          id: '901',
          name: 'alerta_temperatura',
          language: 'pt_BR',
          category: 'UTILITY',
          status: 'APPROVED',
          components: [{ type: 'BODY', text: 'Alerta: {{1}} registrou {{2}} na entrega {{3}}.' }],
        },
      ],
    });
  }
  if (req.method === 'POST' && url.pathname.endsWith('/messages')) {
    return send(res, 200, { messages: [{ id: `wamid.fake${Date.now()}` }] });
  }
  return send(res, 200, {
    display_phone_number: '+55 11 4002-8922',
    verified_name: 'Empresa Demo',
  });
}).listen(port, () => process.stdout.write(`fake graph on ${port}\n`));
