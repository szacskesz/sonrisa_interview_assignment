import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createEmailChannel } from '../src/email-channel.js';

const message = {
  title: 'News 2026-11-23T09:02:00.000Z', topic: 'World', publisher: 'Demo RSS', url: 'https://example.test/news',
};

test('formats a plain-text message and reports SMTP success', async () => {
  const destination = 'reader@example.test';
  const channel = createEmailChannel({ transport: { async sendMail(mail) {
    assert.equal(mail.to.address, destination);
    assert.equal(mail.subject, message.title);
    assert.deepEqual(mail.text.split('\n'), [message.title, 'Topic: World', 'Source: Demo RSS', message.url]);
    return { accepted: [destination] };
  } } });
  assert.deepEqual(await channel.send(destination, message), { status: 'sent' });
});

test('classifies SMTP and connection failures without exposing provider details', async () => {
  for (const [error, status] of [
    [{ responseCode: 451 }, 'retryable'], [{ responseCode: 550 }, 'permanent'],
    [{ code: 'EAUTH' }, 'permanent'], [{ code: 'ETIMEDOUT' }, 'retryable'],
  ]) {
    const channel = createEmailChannel({ transport: { async sendMail() {
      throw Object.assign(new Error('provider detail'), error);
    } } });
    const result = await channel.send('reader@example.test', message);
    assert.equal(result.status, status);
    assert.doesNotMatch(result.error, /provider detail/);
  }
  const rejected = createEmailChannel({ transport: { async sendMail() {
    return { accepted: [], rejectedErrors: [{ responseCode: 550 }] };
  } } });
  assert.equal((await rejected.send('reader@example.test', message)).status, 'permanent');
});

test('delivers a real test email to Mailpit', { skip: !process.env.TEST_MAILPIT_URL }, async () => {
  const destination = `smtp-${randomUUID()}@example.test`;
  const channel = createEmailChannel({ port: Number(process.env.TEST_SMTP_PORT ?? 11025) });
  assert.deepEqual(await channel.send(destination, message), { status: 'sent' });
  const search = new URL('/api/v1/search', process.env.TEST_MAILPIT_URL);
  search.searchParams.set('query', `to:${destination}`);
  const { messages } = await fetch(search).then((response) => response.json());
  assert.equal(messages.length, 1);
  assert.equal(messages[0].Subject, message.title);
  const detail = new URL(`/api/v1/message/${messages[0].ID}`, search);
  const { Text } = await fetch(detail).then((response) => response.json());
  assert.deepEqual(Text.trim().split(/\r?\n/), [message.title, 'Topic: World', 'Source: Demo RSS', message.url]);
});
