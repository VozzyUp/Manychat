// Fake WhatsApp Graph API for end-to-end tests (never talks to Meta).
// Tokens starting with "EAAG-valid" are accepted; anything else gets error 190.
import { createServer } from 'node:http';

const port = Number(process.env.FAKE_GRAPH_PORT ?? 4900);

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  if (url.pathname === '/health') return send(res, 200, { ok: true });
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
