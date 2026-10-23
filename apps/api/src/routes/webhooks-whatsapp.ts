import { createHash } from 'node:crypto';
import { verifyWebhookSignature } from '@nurion/whatsapp';
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../deps';

/**
 * WhatsApp Cloud API webhook (ESCOPO §4.2): validate the signature on the raw bytes, enqueue the
 * payload untouched and answer 200 right away. All processing happens in the worker.
 */
export async function whatsappWebhookRoutes(app: FastifyInstance, deps: AppDeps) {
  await app.register(async (scope) => {
    // Raw body for the HMAC check; only inside this plugin.
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer', bodyLimit: 5 * 1024 * 1024 },
      (_req, body, done) => done(null, body),
    );

    scope.get('/webhooks/whatsapp', async (request, reply) => {
      const query = request.query as Record<string, string | undefined>;
      const expected = deps.whatsapp.verifyToken;
      if (expected && query['hub.mode'] === 'subscribe' && query['hub.verify_token'] === expected) {
        return reply.type('text/plain').send(query['hub.challenge'] ?? '');
      }
      return reply.status(403).send();
    });

    scope.post('/webhooks/whatsapp', async (request, reply) => {
      const secret = deps.whatsapp.appSecret;
      if (!secret) {
        request.log.error('WHATSAPP_APP_SECRET is not configured');
        return reply.status(503).send();
      }
      const raw = Buffer.isBuffer(request.body) ? request.body : Buffer.from('');
      const signature = request.headers['x-hub-signature-256'];
      if (
        !verifyWebhookSignature(raw, typeof signature === 'string' ? signature : undefined, secret)
      ) {
        request.log.warn('whatsapp webhook with invalid signature');
        return reply.status(401).send();
      }
      // Identical deliveries (Meta retries) collapse into one job.
      const jobId = createHash('sha256').update(raw).digest('hex');
      await deps.enqueueInbound(
        { body: raw.toString('utf8'), receivedAt: new Date().toISOString() },
        jobId,
      );
      return reply.status(200).send();
    });
  });
}
