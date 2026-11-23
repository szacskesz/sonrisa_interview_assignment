import { randomBytes } from 'node:crypto';
import Fastify from 'fastify';
import { configureAdminDeliveriesApi } from './admin-deliveries-api.js';
import { configureAdminFeedsApi } from './admin-feeds-api.js';
import { configureApiErrors } from './api-errors.js';
import { migrateDatabase, openDatabase } from './database.js';
import { createDeliveryQueue } from './delivery-jobs.js';
import { createDeliveryWorker } from './delivery-worker.js';
import { createEmailChannel } from './email-channel.js';
import { createFeedPoller } from './feed-polling.js';
import { createFeedScheduler } from './feed-scheduler.js';
import { createFeedStore, defaultFixtureUrl } from './feeds.js';
import { createMatcher } from './matching.js';
import { startPeriodicTask } from './periodic-task.js';
import { normalizeRssUrl } from './rss-http.js';
import { createFixtureRssSource, createRssSource } from './rss-source.js';
import { configureSessionApi } from './session-api.js';
import { configureSubscriptionsApi } from './subscriptions-api.js';
import { createSubscriptionStore } from './subscriptions.js';
import { configureTopicsApi } from './topics-api.js';
import { createUsgsSource } from './usgs-source.js';

/** Build the API for an HTTP listener or in-process request tests. */
export function createApp({
  databasePath = ':memory:', fixtureUrls = [defaultFixtureUrl], now = Date.now, startBackground = false,
  jwtSecret = randomBytes(32).toString('hex'), webOrigin = 'http://127.0.0.1:4200',
  sourceFor, usgsFetch, channels = new Map([['email', createEmailChannel()]]), ...options
} = {}) {
  const fixtures = new Set(fixtureUrls.map((url) => normalizeRssUrl(url).href));
  const selectSource = sourceFor ?? (({ source_kind, url }) => {
    if (source_kind === 'usgs') return createUsgsSource({ fetchFeed: usgsFetch });
    return fixtures.has(url) ? createFixtureRssSource(url) : createRssSource(url);
  });
  const app = Fastify({ ajv: { customOptions: { removeAdditional: false, coerceTypes: false, useDefaults: false } }, ...options });
  configureApiErrors(app);
  configureSessionApi(app, { secret: jwtSecret, webOrigin });
  configureTopicsApi(app);
  configureSubscriptionsApi(app);
  configureAdminFeedsApi(app);
  configureAdminDeliveriesApi(app);
  const database = openDatabase(databasePath);
  app.decorate('database', database);
  app.decorate('services', null);
  let stopPolling;
  let stopDeliveries;
  app.addHook('preClose', async () => {
    await Promise.all([stopPolling?.(), stopDeliveries?.()]);
  });
  app.addHook('onClose', async () => database.close());
  app.addHook('onReady', async () => {
    migrateDatabase(database);
    const feeds = createFeedStore(database, { now });
    const subscriptions = createSubscriptionStore(database, { now });
    const matcher = createMatcher(database);
    const queue = createDeliveryQueue(database);
    const poll = createFeedPoller({ database, feeds, matcher, queue, sourceFor: selectSource, now });
    const pollFeeds = createFeedScheduler({ database, feeds, poll, now });
    const worker = createDeliveryWorker({
      queue, channels, now,
      isEligible: (job) => matcher.isEligible(job.topic, job.published_at_ms, job.destination),
    });
    app.services = { feeds, subscriptions, matcher, queue, pollFeeds, deliver: worker.tick };
    if (startBackground) {
      worker.recover();
      stopPolling = startPeriodicTask(pollFeeds, { onError: (error) => app.log.error(error, 'Feed scheduler failed') });
      stopDeliveries = startPeriodicTask(worker.tick, { onError: (error) => app.log.error(error, 'Delivery worker failed') });
    }
  });
  app.get('/api/health', async () => ({ status: 'ok' }));
  return app;
}
