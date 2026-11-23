import { ApiError, recordIdParams } from './api-errors.js';

const topicField = { type: 'string', minLength: 1, maxLength: 120 };
const channelsField = { type: 'array', minItems: 1, maxItems: 2, uniqueItems: true, items: { enum: ['email', 'slack'] } };
const createBody = {
  type: 'object', required: ['topic'], additionalProperties: false, properties: { topic: topicField, channels: channelsField },
};
const editBody = {
  type: 'object', minProperties: 1, additionalProperties: false,
  properties: { topic: topicField, status: { enum: ['active', 'paused'] }, channels: channelsField },
};

function subscriptionPayload({ id, topic, status, channels, created_at_ms, activated_at_ms }, destination) {
  return { id, topic, status, channels, destination, createdAt: created_at_ms, activatedAt: activated_at_ms };
}

function unavailable() {
  return new ApiError(404, 'subscription_not_found', 'Subscription could not be found');
}

/** Manage the current account's subscriptions and derive destinations from the account. */
export function configureSubscriptionsApi(app, { slackWorkspaceId }) {
  const requireAccount = app.requireAccount;
  const knownTopic = (topic) => {
    if (!app.services.feeds.hasTopic(topic)) {
      throw new ApiError(400, 'topic_unavailable', 'Choose a topic from the available feeds');
    }
  };
  const validateChannels = (userId, selected, current = []) => {
    if (!selected?.includes('slack') || current.includes('slack')) return;
    const link = slackWorkspaceId && app.database.prepare(
      'SELECT 1 FROM users WHERE id = ? AND slack_workspace_id = ?',
    ).get(userId, slackWorkspaceId);
    if (!link) throw new ApiError(400, 'slack_connection_required', 'Connect Slack before selecting Slack delivery');
  };
  app.get('/api/subscriptions', { preHandler: requireAccount }, async ({ account }) => ({
    subscriptions: app.services.subscriptions.list(account.id).map((row) => subscriptionPayload(row, account.email)),
  }));
  app.post('/api/subscriptions', { preHandler: requireAccount, schema: { body: createBody } }, async (request, reply) => {
    const { account, body } = request;
    const topic = body.topic.trim();
    knownTopic(topic);
    validateChannels(account.id, body.channels);
    const row = app.services.subscriptions.create(account.id, topic, body.channels);
    return reply.code(201).send(subscriptionPayload(row, account.email));
  });
  app.patch('/api/subscriptions/:id', {
    preHandler: requireAccount, schema: { params: recordIdParams, body: editBody },
  }, async ({ account, body, params }) => {
    const store = app.services.subscriptions;
    const id = Number(params.id);
    const current = Number.isSafeInteger(id) ? store.get(account.id, id) : undefined;
    if (!current) throw unavailable();
    const topic = body.topic?.trim() ?? current.topic;
    if (topic !== current.topic) knownTopic(topic);
    validateChannels(account.id, body.channels, current.channels);
    return subscriptionPayload(store.update(account.id, id, { topic, status: body.status, channels: body.channels }), account.email);
  });
  app.delete('/api/subscriptions/:id', {
    preHandler: requireAccount, schema: { params: recordIdParams },
  }, async ({ account, params }, reply) => {
    const id = Number(params.id);
    if (!Number.isSafeInteger(id) || !app.services.subscriptions.remove(account.id, id)) throw unavailable();
    return reply.code(204).send();
  });
}
