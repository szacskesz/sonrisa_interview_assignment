import { latestRepresentableDate } from './feeds.js';

/** Run one cycle per due feed, record its health, and back off after failures. */
export function createFeedScheduler({ database, feeds, poll, now = Date.now }) {
  const due = database.prepare('SELECT * FROM feeds WHERE enabled = 1 AND next_poll_at_ms <= ? ORDER BY next_poll_at_ms, id');
  const markAttempt = database.prepare('UPDATE feeds SET last_poll_attempt_at_ms = ? WHERE id = ?');
  const markSuccess = database.prepare(`
    UPDATE feeds SET last_poll_success_at_ms = ?, last_poll_error = NULL, next_poll_at_ms = ? WHERE id = ?
  `);
  const markFailure = database.prepare('UPDATE feeds SET last_poll_error = ?, next_poll_at_ms = ? WHERE id = ?');
  const failures = new Map();
  let active;

  async function run(signal) {
    for (const candidate of due.all(now())) {
      if (signal?.aborted) break;
      const feed = feeds.get(candidate.id);
      if (!feed?.enabled || feed.next_poll_at_ms > now()) continue;
      const revision = feeds.revision(feed.id);
      const startedAt = now();
      markAttempt.run(startedAt, feed.id);
      let failure;
      try {
        if (!await poll(feed.id, signal, startedAt)) continue;
      } catch (error) {
        failure = error instanceof Error ? error.message : 'Feed polling failed';
      }
      const current = feeds.get(feed.id);
      if (signal?.aborted || !current.enabled || revision !== feeds.revision(feed.id)) continue;
      const finishedAt = now();
      const rescheduled = current.next_poll_at_ms !== feed.next_poll_at_ms ||
        current.poll_interval_seconds !== feed.poll_interval_seconds;
      if (failure !== undefined) {
        const previous = failures.get(feed.id);
        const consecutive = previous?.revision === revision ? previous.consecutive + 1 : 1;
        failures.set(feed.id, { revision, consecutive });
        const backoff = Math.min(300_000, 5_000 * 2 ** Math.min(consecutive - 1, 6));
        const nextPoll = Math.min(latestRepresentableDate, finishedAt + backoff);
        markFailure.run(failure.slice(0, 500), rescheduled ? current.next_poll_at_ms : nextPoll, feed.id);
      } else {
        failures.delete(feed.id);
        const nextPoll = Math.min(latestRepresentableDate, Math.max(finishedAt, startedAt + current.poll_interval_seconds * 1_000));
        const coveredThrough = current.source_kind === 'usgs' ? startedAt : finishedAt;
        markSuccess.run(coveredThrough, rescheduled ? current.next_poll_at_ms : nextPoll, feed.id);
      }
    }
  }

  return function tick(signal) {
    active ??= run(signal).finally(() => { active = undefined; });
    return active;
  };
}
