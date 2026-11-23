import { expect, request } from '@playwright/test';

export const minute = 60_000;
export const title = (timestamp) => `News ${new Date(timestamp).toISOString()}`;

export async function account(demo, email) {
  const client = await request.newContext({ baseURL: demo.url, extraHTTPHeaders: { origin: demo.url } });
  const login = await client.post('/api/session', { data: { email, password: demo.password } });
  if (!login.ok()) {
    await client.dispose();
    throw new Error(`API sign-in returned HTTP ${login.status()}`);
  }
  return client;
}

export async function configureFeed(demo, admin, settings = {}) {
  const response = await admin.post('/api/admin/feeds', {
    data: { url: demo.feedUrl, publisher: 'Sonrisa Demo News', topic: 'World News', pollIntervalSeconds: 60, ...settings },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

export async function subscribe(user, topic = 'World News') {
  const response = await user.post('/api/subscriptions', { data: { topic } });
  expect(response.status()).toBe(201);
  return response.json();
}

export async function subjects(demo, destination) {
  return (await demo.messages(destination)).map(({ Subject }) => Subject).sort();
}
