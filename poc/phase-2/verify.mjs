import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nodemailer from 'nodemailer';
import { minute, startFakeFeed } from './fake-rss.mjs';
import { createRssSource } from './rss-source.mjs';
import { openStore, poll } from './store.mjs';

const baseline = Date.parse('2026-11-23T09:02:00.000Z');
const headlineAt = (timestamp) => `News ${new Date(timestamp).toISOString()}`;
const runId = randomUUID().slice(0, 8);
const earlyEmail = `early-${runId}@example.test`;
const lateEmail = `late-${runId}@example.test`;
const otherEmail = `other-${runId}@example.test`;
const smtpPort = Number(process.env.POC_SMTP_PORT ?? 11025);
const inboxPort = Number(process.env.POC_INBOX_PORT ?? 18025);
const inboxUrl = `http://127.0.0.1:${inboxPort}`;
const smtp = nodemailer.createTransport({
  host: '127.0.0.1',
  port: smtpPort,
  secure: false,
  connectionTimeout: 5_000,
  greetingTimeout: 5_000,
  socketTimeout: 5_000,
});

async function readInbox(path) {
  const response = await fetch(new URL(path, inboxUrl), { signal: AbortSignal.timeout(5_000) });
  assert.equal(response.status, 200, `Mailpit API: ${path}`);
  return response.json();
}

async function sendEmail(job) {
  const result = await smtp.sendMail({
    from: 'alerts@example.test',
    to: job.email,
    subject: job.title,
    text: `${job.description}\nTopic: ${job.topic}\nSource: ${job.source_label}`,
  });
  assert.ok(result.accepted.includes(job.email), 'Mailpit accepted the test recipient');
}

async function verifyDelivery() {
  let now = baseline;
  const directory = mkdtempSync(join(tmpdir(), 'sonrisa-alerts-poc-'));
  const path = join(directory, 'demo.sqlite');
  let feed;
  let store;

  try {
    await readInbox('/api/v1/messages?limit=1');
    feed = await startFakeFeed({ now: () => now, pageSize: 2 });
    const source = createRssSource(feed.url);
    store = openStore(path);
    store.addSubscription(earlyEmail, 'world', baseline - minute);
    store.addSubscription(earlyEmail, 'world', baseline - minute);
    store.addSubscription(otherEmail, 'other', baseline - minute);

    await poll(source, store);
    assert.equal(store.checkpoint(), baseline);
    assert.equal(store.pending().length, 0);
    console.log('PASS initial poll saved one timestamp and queued no backlog');

    store.close();
    store = undefined;
    now += 6 * minute;
    store = openStore(path);
    store.addSubscription(lateEmail, 'world', baseline + 4 * minute + 30_000);

    const interruptedAt = baseline + 5 * minute;
    await assert.rejects(poll(source, store, (items) => {
      if (items.at(-1).publishedAt >= interruptedAt) {
        throw new Error('forced page failure');
      }
    }), /forced page failure/);
    assert.equal(store.checkpoint(), baseline + 4 * minute);
    assert.equal(store.pending().length, 4);
    console.log('PASS failed page rolled back its jobs and checkpoint');

    store.close();
    store = undefined;
    store = openStore(path);
    await poll(source, store);
    assert.equal(store.checkpoint(), now);
    assert.equal(store.pending().length, 8);
    await poll(source, store);
    assert.equal(store.pending().length, 8);
    console.log('PASS restart caught up six missed minutes with activation and duplicate checks');

    await assert.rejects(store.deliver(async () => {
      throw new Error('forced send failure');
    }), /forced send failure/);
    assert.equal(store.pending().length, 8);
    await store.deliver(sendEmail);
    assert.equal(store.pending().length, 0);

    const { messages } = await readInbox('/api/v1/messages?limit=100');
    const receivedBy = (address) => messages.filter((message) =>
      message.To?.some((recipient) => recipient.Address === address));
    const subjectsFor = (address) => receivedBy(address).map((message) => message.Subject).sort();
    const expected = Array.from({ length: 6 }, (_, index) => headlineAt(baseline + (index + 1) * minute));
    assert.deepEqual(subjectsFor(earlyEmail), expected);
    assert.deepEqual(subjectsFor(lateEmail), expected.slice(-2));
    assert.equal(receivedBy(otherEmail).length, 0);
    const first = receivedBy(earlyEmail).find((message) => message.Subject === expected[0]);
    const inboxMessage = await readInbox(`/api/v1/message/${first.ID}`);
    assert.deepEqual(inboxMessage.Text.trimEnd().split(/\r?\n/), [
      expected[0], 'Topic: world', 'Source: Sonrisa Demo News',
    ]);
    console.log('PASS Mailpit received 6 emails for the original subscriber and 2 after late activation');
    console.log(`Inbox: ${inboxUrl}`);
  } finally {
    smtp.close();
    store?.close();
    await feed?.close();
    if (existsSync(path)) {
      unlinkSync(path);
    }
    rmdirSync(directory);
  }
}

await verifyDelivery();
