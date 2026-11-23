import { transaction } from './database.js';

const usgsOverlapMs = 5 * 60_000;

/** Import a current RSS snapshot or replay a paged fixture without keeping an article archive. */
export function createFeedPoller({ database, feeds, matcher, queue, sourceFor, now = Date.now }) {
  const baseline = database.prepare(`
    UPDATE feeds SET initialized_at_ms = ?, last_processed_published_at_ms = ? WHERE id = ?
  `);
  const advance = database.prepare('UPDATE feeds SET last_processed_published_at_ms = ? WHERE id = ?');
  const saveSnapshot = database.prepare(`
    UPDATE feeds SET initialized_at_ms = ?, rss_snapshot_ids = ? WHERE id = ?
  `);

  function enqueue(feed, item, publishedAt) {
    for (const { channel, destination } of matcher.recipients(feed.topic, publishedAt)) {
      queue.enqueue({
        feedId: feed.id, sourceUrl: feed.url, itemId: item.id, channel,
        destination, title: item.title, topic: feed.topic, publisher: feed.publisher,
        itemUrl: item.url, publishedAt, aliases: item.aliases,
      }, now());
    }
  }

  return async function poll(feedId, signal, startedAt = now()) {
    const original = feeds.get(feedId);
    if (!original?.enabled) return false;
    const revision = feeds.revision(feedId);
    function currentFeed() {
      const feed = feeds.get(feedId);
      return !signal?.aborted && feed?.enabled && feed.url === original.url && feeds.revision(feedId) === revision ? feed : null;
    }

    const source = sourceFor(original);
    if (source.scan) {
      const first = original.last_poll_success_at_ms === null;
      const after = first ? null : Math.max(original.initialized_at_ms, original.last_poll_success_at_ms - usgsOverlapMs);
      for await (const items of source.scan({ after, through: startedAt, signal })) {
        const current = currentFeed();
        if (!current) return false;
        if (first) {
          baseline.run(startedAt, null, feedId);
          return true;
        }
        transaction(database, () => {
          for (const item of items) {
            if (item.publishedAt > original.initialized_at_ms && item.publishedAt <= startedAt) {
              enqueue(current, item, item.publishedAt);
            }
          }
        });
      }
      return Boolean(currentFeed());
    }
    if (source.snapshot) {
      const items = await source.snapshot();
      const current = currentFeed();
      if (!current) return false;
      const observedAt = now();
      const visible = items.filter(({ publishedAt }) => publishedAt === null || publishedAt <= observedAt);
      const first = original.rss_snapshot_ids === null;
      if (!first && items.length === 0) return true;
      const initializedAt = first ? observedAt : original.initialized_at_ms;
      const seen = new Set(first ? [] : JSON.parse(original.rss_snapshot_ids));
      transaction(database, () => {
        if (!first) {
          for (const item of visible) {
            const publishedAt = item.publishedAt ?? observedAt;
            if (!seen.has(item.id) && publishedAt > initializedAt) enqueue(current, item, publishedAt);
          }
        }
        saveSnapshot.run(initializedAt, JSON.stringify(visible.map(({ id }) => id)), feedId);
      });
      return true;
    }
    const through = await source.latest();
    if (!currentFeed()) return false;
    if (original.initialized_at_ms === null) {
      baseline.run(now(), through, feedId);
      return true;
    }
    let after = original.last_processed_published_at_ms ?? original.initialized_at_ms;
    while (through !== null && after < through) {
      const items = await source.page(after, through);
      const current = currentFeed();
      if (!current) return false;
      let previous = after;
      for (const { publishedAt } of items) {
        if (!Number.isSafeInteger(publishedAt) || publishedAt <= previous || publishedAt > through) {
          throw new Error('Event source replay page did not advance in publication order');
        }
        previous = publishedAt;
      }
      if (previous === after) throw new Error('Event source replay page did not advance');
      transaction(database, () => {
        for (const item of items) enqueue(current, item, item.publishedAt);
        advance.run(previous, feedId);
      });
      after = previous;
    }
    return true;
  };
}
