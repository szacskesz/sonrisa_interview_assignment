/** Persist a deduplicated delivery queue and its most recent attempt outcome. */
export function createDeliveryQueue(database) {
  const insert = database.prepare(`
    INSERT INTO delivery_jobs (
      feed_id, source_url, source_item_id, channel, destination, title, topic, publisher,
      item_url, published_at_ms, status, created_at_ms, next_attempt_at_ms
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    ON CONFLICT (feed_id, source_url, source_item_id, channel, destination) DO NOTHING
  `);
  const nextDue = database.prepare(`
    SELECT * FROM delivery_jobs WHERE status = 'pending' AND next_attempt_at_ms <= ?
    ORDER BY next_attempt_at_ms, id LIMIT 1
  `);
  const claim = database.prepare(`
    UPDATE delivery_jobs SET status = 'sending', attempt_count = attempt_count + 1, next_attempt_at_ms = NULL
    WHERE id = ? AND status = 'pending' AND next_attempt_at_ms <= ? RETURNING *
  `);
  const finish = database.prepare(`
    UPDATE delivery_jobs SET status = ?, next_attempt_at_ms = ?, sent_at_ms = ?, last_error = ?
    WHERE id = ? AND status = 'sending' AND attempt_count = ?
  `);
  const cancel = database.prepare(`
    UPDATE delivery_jobs SET status = 'canceled', next_attempt_at_ms = NULL
    WHERE id = ? AND status = 'pending'
  `);
  const recover = database.prepare(`
    UPDATE delivery_jobs SET status = 'pending', next_attempt_at_ms = ?,
      last_error = 'Previous delivery attempt was interrupted'
    WHERE status = 'sending'
  `);
  return {
    enqueue({ feedId, sourceUrl, itemId, channel, destination, title, topic, publisher, itemUrl, publishedAt }, now) {
      return insert.run(feedId, sourceUrl, itemId, channel, destination, title, topic, publisher,
        itemUrl ?? null, publishedAt, now, now).changes > 0;
    },
    nextDue: (now) => nextDue.get(now),
    claim: (id, now) => claim.get(id, now),
    cancel: (id) => cancel.run(id).changes > 0,
    finish(job, { status, nextAttemptAt = null, sentAt = null, lastError = null }) {
      return finish.run(status, nextAttemptAt, sentAt, lastError, job.id, job.attempt_count).changes > 0;
    },
    recoverInterrupted: (now) => recover.run(now).changes,
  };
}
