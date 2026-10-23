import multipart from '@fastify/multipart';
import type { Logger } from '@nurion/shared';
import type { AppDeps } from './deps';
import { departmentRoutes } from './routes/departments';
import { meRoutes } from './routes/me';
import { memberRoutes } from './routes/members';
import { tenantRoutes } from './routes/tenant';
import { buildServer, type App, type ReadinessCheck } from './server';

/** The whole API: base server (health, errors) + /v1 routes. */
export async function buildApp(options: {
  logger: Logger;
  deps: AppDeps;
  checks?: ReadinessCheck[];
}): Promise<App> {
  const app = await buildServer({ logger: options.logger, checks: options.checks });
  app.decorateRequest('auth', null);
  app.decorateRequest('tenant', null);
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 1 } });

  meRoutes(app, options.deps);
  tenantRoutes(app, options.deps);
  memberRoutes(app, options.deps);
  departmentRoutes(app, options.deps);
  return app;
}
