import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test as base } from '@playwright/test';
import { seedDemoAccounts } from '../../backend/src/accounts.js';
import { createApp } from '../../backend/src/app.js';
import { createEmailChannel } from '../../backend/src/email-channel.js';
import { startObservedFeed } from './observed-feed.mjs';

export const initialTime = Date.parse('2026-11-23T09:02:00.000Z');
const webBuild = new URL('../dist/world-event-alerts/browser/', import.meta.url);
const mailpitUrl = process.env.TEST_MAILPIT_URL ?? 'http://127.0.0.1:18025';
const contentType = { html: 'text/html', js: 'text/javascript', css: 'text/css' };

async function mailpit(path) {
  const response = await fetch(new URL(path, mailpitUrl), { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`Mailpit API returned HTTP ${response.status}`);
  return response.json();
}

export const test = base.extend({
  async demo({}, use) {
    const directory = await mkdtemp(join(tmpdir(), 'alerts-browser-'));
    let time = initialTime;
    let app;
    const feeds = [];
    let server;
    try {
      await mailpit('/api/v1/messages?limit=1');
      const now = () => time;
      const addFeed = async () => {
        const feed = await startObservedFeed(now);
        feeds.push(feed);
        return feed;
      };
      const feed = await addFeed();
      server = createServer((request, response) => {
        const { pathname } = new URL(request.url, 'http://127.0.0.1');
        if (pathname.startsWith('/api/')) {
          if (app) app.routing(request, response);
          else response.writeHead(503).end();
          return;
        }
        const asset = /^\/([A-Z0-9_.-]+\.(js|css))$/i.exec(pathname);
        const file = new URL(asset ? asset[1] : 'index.html', webBuild);
        void readFile(file).then(
          (body) => response.writeHead(200, { 'Content-Type': `${contentType[asset?.[2] ?? 'html']}; charset=utf-8` }).end(body),
          () => response.writeHead(404).end(),
        );
      });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const url = `http://127.0.0.1:${server.address().port}`;
      const suffix = randomUUID();
      const admin = `admin-${suffix}@example.test`;
      const user = `user-${suffix}@example.test`;
      const lateUser = `late-${suffix}@example.test`;
      const password = 'local-e2e-demo-password';
      const email = createEmailChannel({ port: Number(process.env.TEST_SMTP_PORT ?? 11025) });
      const jwtSecret = randomBytes(32).toString('hex');
      let failNext = false;
      const channel = {
        send(destination, message) {
          if (!failNext) return email.send(destination, message);
          failNext = false;
          return { status: 'retryable', error: 'Test SMTP interruption' };
        },
      };
      const open = async (startBackground) => {
        app = createApp({
          databasePath: join(directory, 'alerts.sqlite'), jwtSecret,
          trustedUrls: feeds.map(({ url }) => url), webOrigin: url, now, startBackground, channels: new Map([['email', channel]]),
        });
        await app.ready();
      };
      await open(true);
      await seedDemoAccounts(app.database, {
        DEMO_ADMIN_EMAIL: admin, DEMO_ADMIN_PASSWORD: password, DEMO_USER_EMAIL: user, DEMO_USER_PASSWORD: password,
      });
      await seedDemoAccounts(app.database, {
        DEMO_ADMIN_EMAIL: admin, DEMO_ADMIN_PASSWORD: password, DEMO_USER_EMAIL: lateUser, DEMO_USER_PASSWORD: password,
      });
      await use({
        url, admin, user, lateUser, password, feedUrl: feed.url, feed, addFeed, now,
        advance(milliseconds) { time += milliseconds; },
        async stop() {
          const current = app;
          app = undefined;
          await current.close();
        },
        start: () => open(false),
        poll: () => app.services.pollFeeds(),
        deliver: () => app.services.deliver(),
        failNextDelivery() { failNext = true; },
        async messages(destination = user) {
          const query = new URLSearchParams({ query: `to:${destination}` });
          const { messages } = await mailpit(`/api/v1/search?${query}`);
          return messages ?? [];
        },
        message: (id) => mailpit(`/api/v1/message/${id}`),
      });
    } finally {
      try {
        if (server?.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        await app?.close();
      } finally {
        try {
          await Promise.all(feeds.map((feed) => feed.close()));
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
      }
    }
  },
});

export async function signIn(page, demo, email, password = demo.password) {
  await page.goto(`${demo.url}/sign-in`);
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}
