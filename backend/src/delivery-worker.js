/** Process durable jobs with current eligibility, channel dispatch, and limited retries. */
export function createDeliveryWorker({ queue, channels, isEligible, now = Date.now, maxAttempts = 5 }) {
  let active;

  async function run(signal) {
    for (let index = 0; index < 100 && !signal?.aborted; index += 1) {
      const pending = queue.nextDue(now());
      if (!pending) break;
      const channel = channels.get(pending.channel);
      if (channel && !isEligible(pending)) {
        queue.cancel(pending.id);
        continue;
      }
      const job = queue.claim(pending.id, now());
      if (!job) continue;
      let result;
      try {
        result = channel ? await channel.send(job.destination, {
          title: job.title, topic: job.topic, publisher: job.publisher,
          url: job.item_url, publishedAt: job.published_at_ms,
          ...(job.source_kind === 'usgs' ? { occurredAt: job.published_at_ms } : {}),
        }) : { status: 'permanent', error: 'Delivery channel is unavailable' };
      } catch {
        result = { status: 'retryable', error: 'Delivery channel failed' };
      }
      if (result.status === 'sent') {
        queue.finish(job, { status: 'sent', sentAt: now() });
      } else if (result.status === 'retryable' && job.attempt_count < maxAttempts) {
        const backoff = Math.min(300_000, 5_000 * 2 ** (job.attempt_count - 1));
        queue.finish(job, { status: 'pending', nextAttemptAt: now() + backoff, lastError: result.error });
      } else {
        queue.finish(job, { status: 'failed', lastError: result.error });
      }
    }
  }

  return {
    recover: () => queue.recoverInterrupted(now(), maxAttempts),
    tick(signal) {
      active ??= run(signal).finally(() => { active = undefined; });
      return active;
    },
  };
}
