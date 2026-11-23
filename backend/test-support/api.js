import { createApp } from '../src/app.js';

export const origin = 'http://127.0.0.1:4200';

export async function createApiFixture(t, options) {
  const app = createApp(options);
  t.after(() => app.close());
  await app.ready();
  app.database.exec(`
    INSERT INTO users VALUES
      (1, 'admin@example.test', 'hash', 'admin', 0),
      (2, 'reader@example.test', 'hash', 'user', 0),
      (3, 'other@example.test', 'hash', 'user', 0);
  `);
  function request(userId, method, url, payload) {
    const headers = { origin };
    if (userId) headers.cookie = `alerts_session=${app.jwt.sign({ sub: String(userId) })}`;
    return app.inject({ method, url, payload, headers });
  }
  return { app, request };
}
