import Fastify from 'fastify';
import { migrateDatabase, openDatabase } from './database.js';
import { createDeliveryQueue } from './delivery-jobs.js';
import { createDeliveryWorker } from './delivery-worker.js';
import { createEmailChannel } from './email-channel.js';
import { createFeedPoller } from './feed-polling.js';
import { createFeedScheduler } from './feed-scheduler.js';
import { createFeedStore } from './feeds.js';
import { createMatcher } from './matching.js';
import { startPeriodicTask } from './periodic-task.js';
import { createRssSource } from './rss-source.js';
import { createSubscriptionStore } from './subscriptions.js';

/** Build the API for an HTTP listener or in-process request tests. */
export function createApp({
  databasePath = ':memory:', trustedUrls, now = Date.now, startBackground = false,
  sourceFor = ({ url }) => createRssSource(url), channels = new Map([['email', createEmailChannel()]]), ...options
} = {}) {
  const app = Fastify(options);
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
    const feeds = createFeedStore(database, { trustedUrls, now });
    const subscriptions = createSubscriptionStore(database, { now });
    const matcher = createMatcher(database);
    const queue = createDeliveryQueue(database);
    const poll = createFeedPoller({ database, feeds, matcher, queue, sourceFor, now });
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
