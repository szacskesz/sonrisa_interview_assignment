import Fastify from 'fastify';

/** Build the API for an HTTP listener or in-process request tests. */
export function createApp(options = {}) {
  const app = Fastify(options);
  app.get('/api/health', async () => ({ status: 'ok' }));
  return app;
}
