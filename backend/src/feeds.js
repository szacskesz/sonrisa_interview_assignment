import { normalizeRssUrl } from './rss-http.js';

export const defaultFixtureUrl = 'http://127.0.0.1:18080/rss.xml';
export const latestRepresentableDate = 8_640_000_000_000_000;

export class FeedSettingsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Store feed settings and track configuration changes that invalidate a running poll. */
export function createFeedStore(database, { now = Date.now } = {}) {
  const invalidations = new Map();
  const select = database.prepare('SELECT * FROM feeds WHERE id = ?');
  const byUrl = database.prepare('SELECT id FROM feeds WHERE url = ?');
  const list = database.prepare('SELECT * FROM feeds ORDER BY id');
  const topics = database.prepare('SELECT DISTINCT topic FROM feeds WHERE enabled = 1 ORDER BY topic COLLATE NOCASE, topic');
  const hasTopic = database.prepare('SELECT 1 FROM feeds WHERE enabled = 1 AND topic = ? LIMIT 1');
  const insert = database.prepare(`
    INSERT INTO feeds (url, publisher, topic, enabled, poll_interval_seconds, next_poll_at_ms)
    VALUES (?, ?, ?, ?, ?, ?) RETURNING *
  `);
  const update = database.prepare(`
    UPDATE feeds SET url = ?, publisher = ?, topic = ?, enabled = ?, poll_interval_seconds = ?,
      next_poll_at_ms = ?, initialized_at_ms = ?, last_processed_published_at_ms = ?,
      last_poll_attempt_at_ms = ?, last_poll_success_at_ms = ?, last_poll_error = ?, rss_snapshot_ids = ?
    WHERE id = ? RETURNING *
  `);

  function settings(values, existing) {
    let url;
    try {
      url = normalizeRssUrl(values.url ?? existing?.url).href;
    } catch {
      throw new FeedSettingsError('invalid_feed_url', 'Enter a valid RSS URL');
    }
    const duplicate = byUrl.get(url);
    if (duplicate && duplicate.id !== existing?.id) {
      throw new FeedSettingsError('duplicate_feed_url', 'That RSS URL is already configured');
    }
    const publisher = (values.publisher ?? existing?.publisher)?.trim();
    const topic = (values.topic ?? existing?.topic)?.trim();
    const interval = values.pollIntervalSeconds ?? existing?.poll_interval_seconds ?? 300;
    if (!publisher || !topic || !Number.isSafeInteger(interval) || interval < 1 ||
        interval > Math.floor((latestRepresentableDate - now()) / 1000)) {
      throw new FeedSettingsError('invalid_feed_settings', 'Enter a publisher, topic, and positive polling interval');
    }
    return {
      url, publisher, topic, interval,
      enabled: Number(values.enabled ?? (existing ? Boolean(existing.enabled) : true)),
    };
  }

  const revision = (id) => invalidations.get(id) ?? 0;
  return {
    get: (id) => select.get(id),
    list: () => list.all(),
    topics: () => topics.all().map(({ topic }) => topic),
    hasTopic: (topic) => Boolean(hasTopic.get(topic)),
    revision,
    create(values) {
      const { url, publisher, topic, enabled, interval } = settings(values);
      return insert.get(url, publisher, topic, enabled, interval, now());
    },
    update(id, values) {
      const existing = select.get(id);
      if (!existing) return undefined;
      const { url, publisher, topic, enabled, interval } = settings(values, existing);
      const urlChanged = url !== existing.url;
      const toggled = enabled !== existing.enabled;
      const reset = urlChanged || (toggled && enabled);
      let nextPoll = existing.next_poll_at_ms;
      if (reset) nextPoll = now();
      else if (enabled && interval !== existing.poll_interval_seconds) nextPoll = now() + interval * 1000;
      const updated = update.get(
        url, publisher, topic, enabled, interval,
        nextPoll,
        reset ? null : existing.initialized_at_ms,
        reset ? null : existing.last_processed_published_at_ms,
        reset ? null : existing.last_poll_attempt_at_ms,
        reset ? null : existing.last_poll_success_at_ms,
        reset ? null : existing.last_poll_error,
        reset ? null : existing.rss_snapshot_ids,
        id,
      );
      if (toggled || urlChanged) invalidations.set(id, revision(id) + 1);
      return updated;
    },
  };
}
