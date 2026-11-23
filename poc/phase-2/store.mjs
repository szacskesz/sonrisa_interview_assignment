import { DatabaseSync } from 'node:sqlite';

const sourceId = 'fake-rss';

export function openStore(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS checkpoints (
      source_id TEXT PRIMARY KEY,
      published_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL,
      topic TEXT NOT NULL,
      activated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS email_jobs (
      id INTEGER PRIMARY KEY,
      source_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      email TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      topic TEXT NOT NULL,
      source_label TEXT NOT NULL,
      sent_at INTEGER,
      UNIQUE (source_id, item_id, email)
    );
  `);
  const findCheckpoint = db.prepare('SELECT published_at FROM checkpoints WHERE source_id = ?');
  const saveCheckpoint = db.prepare(`
    INSERT INTO checkpoints (source_id, published_at) VALUES (?, ?)
    ON CONFLICT (source_id) DO UPDATE SET published_at = excluded.published_at
  `);
  const findMatching = db.prepare(`
    SELECT email FROM subscriptions WHERE topic = ? AND activated_at < ?
  `);
  const queueEmail = db.prepare(`
    INSERT INTO email_jobs (source_id, item_id, email, title, description, topic, source_label)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (source_id, item_id, email) DO NOTHING
  `);
  const findPending = db.prepare('SELECT * FROM email_jobs WHERE sent_at IS NULL ORDER BY id');
  const markSent = db.prepare('UPDATE email_jobs SET sent_at = ? WHERE id = ?');

  return {
    close: () => db.close(),
    addSubscription(email, topic, activatedAt) {
      db.prepare('INSERT INTO subscriptions (email, topic, activated_at) VALUES (?, ?, ?)')
        .run(email, topic, activatedAt);
    },
    checkpoint: () => findCheckpoint.get(sourceId)?.published_at,
    initialize: (timestamp) => saveCheckpoint.run(sourceId, timestamp),
    pending: () => findPending.all(),
    commitPage(items, beforeCommit) {
      db.exec('BEGIN');
      try {
        for (const item of items) {
          for (const { email } of findMatching.all(item.topic, item.publishedAt)) {
            queueEmail.run(sourceId, item.id, email, item.title, item.description,
              item.topic, item.sourceLabel);
          }
        }
        saveCheckpoint.run(sourceId, items.at(-1).publishedAt);
        beforeCommit?.(items);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    async deliver(send) {
      for (const job of findPending.all()) {
        await send(job);
        markSent.run(Date.now(), job.id);
      }
    },
  };
}

export async function poll(source, store, beforeCommit) {
  const through = await source.latest();
  let cursor = store.checkpoint();
  if (cursor === undefined) {
    store.initialize(through);
    return;
  }

  while (cursor < through) {
    const items = await source.page(cursor, through);
    store.commitPage(items, beforeCommit);
    cursor = items.at(-1).publishedAt;
  }
}
