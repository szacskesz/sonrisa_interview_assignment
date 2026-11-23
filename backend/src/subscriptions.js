/** Persist subscription lifecycle changes scoped to the owning account. */
export function createSubscriptionStore(database, { now = Date.now } = {}) {
  const list = database.prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY id');
  const find = database.prepare('SELECT * FROM subscriptions WHERE user_id = ? AND id = ?');
  const insert = database.prepare(`
    INSERT INTO subscriptions (user_id, topic, status, created_at_ms, activated_at_ms)
    VALUES (?, ?, 'active', ?, ?) RETURNING *
  `);
  const update = database.prepare(`
    UPDATE subscriptions SET topic = ?, status = ?, activated_at_ms = ?
    WHERE user_id = ? AND id = ? RETURNING *
  `);
  const remove = database.prepare('DELETE FROM subscriptions WHERE user_id = ? AND id = ?');

  return {
    list: (userId) => list.all(userId),
    get: (userId, id) => find.get(userId, id),
    create(userId, topic) {
      const timestamp = now();
      return insert.get(userId, topic, timestamp, timestamp);
    },
    update(userId, id, changes) {
      const current = find.get(userId, id);
      if (!current) return undefined;
      const { topic = current.topic, status = current.status } = changes;
      const reactivated = status === 'active' && current.status === 'paused';
      const activatedAt = reactivated || topic !== current.topic
        ? Math.max(now(), current.activated_at_ms)
        : current.activated_at_ms;
      return update.get(topic, status, activatedAt, userId, id);
    },
    remove: (userId, id) => remove.run(userId, id).changes > 0,
  };
}
