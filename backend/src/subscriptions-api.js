import { ApiError, recordIdParams } from './api-errors.js';

const topicField = { type: 'string', minLength: 1, maxLength: 120 };
const createBody = { type: 'object', required: ['topic'], additionalProperties: false, properties: { topic: topicField } };
const editBody = {
  type: 'object', minProperties: 1, additionalProperties: false,
  properties: { topic: topicField, status: { enum: ['active', 'paused'] } },
};

function subscriptionPayload({ id, topic, status, created_at_ms, activated_at_ms }, destination) {
  return { id, topic, status, destination, createdAt: created_at_ms, activatedAt: activated_at_ms };
}

function unavailable() {
  return new ApiError(404, 'subscription_not_found', 'Subscription could not be found');
}

/** Manage the current account's subscriptions and derive destinations from the account. */
export function configureSubscriptionsApi(app) {
  const requireAccount = app.requireAccount;
  const knownTopic = (topic) => {
    if (!app.services.feeds.hasTopic(topic)) {
      throw new ApiError(400, 'topic_unavailable', 'Choose a topic from the available feeds');
    }
  };
  app.get('/api/subscriptions', { preHandler: requireAccount }, async ({ account }) => ({
    subscriptions: app.services.subscriptions.list(account.id).map((row) => subscriptionPayload(row, account.email)),
  }));
  app.post('/api/subscriptions', { preHandler: requireAccount, schema: { body: createBody } }, async (request, reply) => {
    const { account, body } = request;
    const topic = body.topic.trim();
    knownTopic(topic);
    const row = app.services.subscriptions.create(account.id, topic);
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
    return subscriptionPayload(store.update(account.id, id, { topic, status: body.status }), account.email);
  });
  app.delete('/api/subscriptions/:id', {
    preHandler: requireAccount, schema: { params: recordIdParams },
  }, async ({ account, params }, reply) => {
    const id = Number(params.id);
    if (!Number.isSafeInteger(id) || !app.services.subscriptions.remove(account.id, id)) throw unavailable();
    return reply.code(204).send();
  });
}
