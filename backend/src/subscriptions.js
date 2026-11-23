import { transaction } from './database.js';

/** Persist subscription lifecycle and per-channel activation scoped to the owning account. */
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
  const channels = database.prepare('SELECT channel FROM subscription_channels WHERE subscription_id = ? ORDER BY channel');
  const addChannel = database.prepare('INSERT INTO subscription_channels VALUES (?, ?, ?)');
  const removeChannel = database.prepare('DELETE FROM subscription_channels WHERE subscription_id = ? AND channel = ?');
  const withChannels = (row) => row && { ...row, channels: channels.all(row.id).map(({ channel }) => channel) };

  return {
    list: (userId) => list.all(userId).map(withChannels),
    get: (userId, id) => withChannels(find.get(userId, id)),
    create(userId, topic, selected = ['email']) {
      return transaction(database, () => {
        const timestamp = now();
        const row = insert.get(userId, topic, timestamp, timestamp);
        for (const channel of selected) addChannel.run(row.id, channel, timestamp);
        return withChannels(row);
      });
    },
    update(userId, id, changes) {
      return transaction(database, () => {
        const current = withChannels(find.get(userId, id));
        if (!current) return undefined;
        const { topic = current.topic, status = current.status, channels: selected = current.channels } = changes;
        const timestamp = Math.max(now(), current.activated_at_ms);
        const reactivated = status === 'active' && current.status === 'paused';
        const activatedAt = reactivated || topic !== current.topic ? timestamp : current.activated_at_ms;
        for (const channel of current.channels) {
          if (!selected.includes(channel)) removeChannel.run(id, channel);
        }
        for (const channel of selected) {
          if (!current.channels.includes(channel)) addChannel.run(id, channel, timestamp);
        }
        return withChannels(update.get(topic, status, activatedAt, userId, id));
      });
    },
    remove: (userId, id) => remove.run(userId, id).changes > 0,
  };
}
