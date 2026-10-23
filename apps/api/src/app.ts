import multipart from '@fastify/multipart';
import type { Logger } from '@nurion/shared';
import type { AppDeps } from './deps';
import { contactRoutes } from './routes/contacts';
import { documentRoutes } from './routes/documents';
import { knowledgeRoutes } from './routes/knowledge';
import { departmentRoutes } from './routes/departments';
import { meRoutes } from './routes/me';
import { memberRoutes } from './routes/members';
import { tenantRoutes } from './routes/tenant';
import { whatsappWebhookRoutes } from './routes/webhooks-whatsapp';
import { whatsappNumberRoutes } from './routes/whatsapp-numbers';
import { whatsappTemplateRoutes } from './routes/whatsapp-templates';
import { buildServer, type App, type ReadinessCheck } from './server';

/** The whole API: base server (health, errors) + /v1 routes. */
export async function buildApp(options: {
  logger: Logger;
  deps: AppDeps;
  checks?: ReadinessCheck[];
  reportError?: (error: unknown, tags: Record<string, string>) => void;
}): Promise<App> {
  const app = await buildServer({
    logger: options.logger,
    checks: options.checks,
    reportError: options.reportError,
  });
  app.decorateRequest('auth', null);
  app.decorateRequest('tenant', null);
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 1 } });

  meRoutes(app, options.deps);
  tenantRoutes(app, options.deps);
  memberRoutes(app, options.deps);
  departmentRoutes(app, options.deps);
  contactRoutes(app, options.deps);
  documentRoutes(app, options.deps);
  knowledgeRoutes(app, options.deps);
  whatsappNumberRoutes(app, options.deps);
  whatsappTemplateRoutes(app, options.deps);
  await whatsappWebhookRoutes(app, options.deps);
  return app;
}
