import { createServer, type Server } from 'node:http';

export type HealthCheck = () => Promise<boolean>;

/** Tiny HTTP server for the Docker/Traefik health check: 200 when `check` passes, else 503. */
export function createHealthServer(check: HealthCheck): Server {
  return createServer((request, response) => {
    if (request.url !== '/health') {
      response.writeHead(404).end();
      return;
    }
    void check()
      .catch(() => false)
      .then((ok) => {
        response
          .writeHead(ok ? 200 : 503, { 'content-type': 'application/json' })
          .end(JSON.stringify({ status: ok ? 'ok' : 'unavailable' }));
      });
  });
}
