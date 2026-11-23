import { createApp } from './app.js';
import { configuredDatabasePath } from './database.js';

const app = createApp({
  databasePath: configuredDatabasePath(),
  logger: true,
  disableRequestLogging: true,
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    try {
      await app.close();
    } catch (error) {
      app.log.error(error, 'Shutdown failed');
      process.exitCode = 1;
    }
  });
}

try {
  await app.listen({ host: '127.0.0.1', port: Number(process.env.API_PORT ?? 3000) });
} catch (error) {
  app.log.error(error, 'Startup failed');
  await app.close();
  process.exitCode = 1;
}
