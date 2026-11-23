import { createApp } from './app.js';
import { configuredDatabasePath } from './database.js';
import { createEmailChannel } from './email-channel.js';
import { createSlackChannel } from './slack-channel.js';
import { createSlackIdentity, slackConfiguration } from './slack-identity.js';

const slack = slackConfiguration(process.env, process.env.WEB_ORIGIN);
const channels = new Map([['email', createEmailChannel({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 11025),
  from: process.env.SMTP_FROM,
})]]);
if (slack) channels.set('slack', createSlackChannel(slack));

const app = createApp({
  databasePath: configuredDatabasePath(),
  startBackground: true,
  jwtSecret: process.env.JWT_SECRET ?? '',
  webOrigin: process.env.WEB_ORIGIN,
  slackIdentity: slack && createSlackIdentity(slack),
  fixtureUrls: (process.env.FIXTURE_RSS_URLS ?? process.env.TRUSTED_RSS_URLS)?.split(',').map((url) => url.trim()),
  channels,
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
