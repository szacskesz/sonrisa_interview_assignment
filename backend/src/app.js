import Fastify from 'fastify';
import { openDatabase } from './database.js';

/** Build the API for an HTTP listener or in-process request tests. */
export function createApp({ databasePath = ':memory:', ...options } = {}) {
  const app = Fastify(options);
  const database = openDatabase(databasePath);
  app.decorate('database', database);
  app.addHook('onClose', async () => database.close());
  app.get('/api/health', async () => ({ status: 'ok' }));
  return app;
}
