import { transaction } from './database.js';

/** Import a feed snapshot or its missed pages without keeping an article archive. */
export function createFeedPoller({ database, feeds, matcher, queue, sourceFor, now = Date.now }) {
  const baseline = database.prepare(`
    UPDATE feeds SET initialized_at_ms = ?, last_processed_published_at_ms = ? WHERE id = ?
  `);
  const advance = database.prepare('UPDATE feeds SET last_processed_published_at_ms = ? WHERE id = ?');

  return async function poll(feedId) {
    const original = feeds.get(feedId);
    if (!original?.enabled) return false;
    if (!feeds.isTrusted(original.url)) throw new Error('RSS URL is no longer a trusted demo fixture');
    const revision = feeds.revision(feedId);
    function currentFeed() {
      const feed = feeds.get(feedId);
      return feed?.enabled && feed.url === original.url && feeds.revision(feedId) === revision ? feed : null;
    }

    const source = sourceFor(original);
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
        for (const item of items) {
          for (const destination of matcher.recipients(current.topic, item.publishedAt)) {
            queue.enqueue({
              feedId, sourceUrl: current.url, itemId: item.id, channel: 'email',
              destination, title: item.title, topic: current.topic, publisher: current.publisher,
              itemUrl: item.url, publishedAt: item.publishedAt,
            }, now());
          }
        }
        advance.run(previous, feedId);
      });
      after = previous;
    }
    return true;
  };
}
