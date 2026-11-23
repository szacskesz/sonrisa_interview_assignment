import { ApiError, recordIdParams } from './api-errors.js';
import { FeedSettingsError } from './feeds.js';

const fields = {
  url: { type: 'string', minLength: 1, maxLength: 2_048 },
  publisher: { type: 'string', minLength: 1, maxLength: 120 },
  topic: { type: 'string', minLength: 1, maxLength: 120 },
  enabled: { type: 'boolean' },
  pollIntervalSeconds: { type: 'integer', minimum: 1 },
};
const createBody = {
  type: 'object', additionalProperties: false,
  properties: { ...fields, sourceKind: { enum: ['rss', 'usgs'] } },
  if: { required: ['sourceKind'], properties: { sourceKind: { const: 'usgs' } } },
  else: { required: ['url', 'publisher', 'topic'] },
};
const editBody = { type: 'object', minProperties: 1, additionalProperties: false, properties: fields };

function feedPayload(row) {
  return {
    id: row.id, sourceKind: row.source_kind, url: row.url, publisher: row.publisher, topic: row.topic, enabled: Boolean(row.enabled),
    pollIntervalSeconds: row.poll_interval_seconds, nextPollAt: row.next_poll_at_ms,
    lastPollAttemptAt: row.last_poll_attempt_at_ms, lastPollSuccessAt: row.last_poll_success_at_ms,
    lastPollError: row.last_poll_error,
  };
}

function withFeedValidation(update) {
  try {
    return update();
  } catch (error) {
    if (!(error instanceof FeedSettingsError)) throw error;
    const conflict = ['duplicate_feed_url', 'duplicate_usgs_source'].includes(error.code);
    throw new ApiError(conflict ? 409 : 400, error.code, error.message);
  }
}

/** Let admins list poll health and create or edit RSS feeds. */
export function configureAdminFeedsApi(app) {
  const onRequest = app.requireAdmin;
  app.get('/api/admin/feeds', { onRequest }, async () => ({
    feeds: app.services.feeds.list().map(feedPayload),
  }));
  app.post('/api/admin/feeds', { onRequest, schema: { body: createBody } }, async ({ body }, reply) => {
    const feed = withFeedValidation(() => app.services.feeds.create(body));
    return reply.code(201).send(feedPayload(feed));
  });
  app.patch('/api/admin/feeds/:id', { onRequest, schema: { params: recordIdParams, body: editBody } }, async ({ params, body }) => {
    const id = Number(params.id);
    const feed = Number.isSafeInteger(id) && withFeedValidation(() => app.services.feeds.update(id, body));
    if (!feed) throw new ApiError(404, 'feed_not_found', 'RSS feed could not be found');
    return feedPayload(feed);
  });
}
