import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEmailChannel } from '../src/email-channel.js';
import { usgsSource } from '../src/usgs-source.js';
import { createApiFixture } from '../test-support/api.js';

const anchor = Date.parse('2026-11-23T09:02:00Z');
const minute = 60_000;
const day = 86_400_000;
const path = '/api/admin/feeds';
const event = (id, time, mag = 4.6, ids = id) => ({
  id, type: 'Feature', properties: { type: 'earthquake', mag, place: 'Test region', time, updated: time, ids },
});
const response = (...features) => Response.json({ type: 'FeatureCollection', features });

test('provisions the built-in settings and exposes the enabled earthquake topic', async (t) => {
  const { request } = await createApiFixture(t);
  const settings = { sourceKind: 'usgs' };
  assert.equal((await request(2, 'POST', path, settings)).statusCode, 403);
  assert.equal((await request(1, 'POST', path, { ...settings, url: 'https://example.test/' })).json().code, 'fixed_usgs_settings');
  const created = await request(1, 'POST', path, settings);
  assert.equal(created.statusCode, 201);
  const feed = created.json();
  assert.deepEqual({ url: feed.url, topic: feed.topic, publisher: feed.publisher, pollIntervalSeconds: feed.pollIntervalSeconds }, usgsSource);
  assert.equal(feed.sourceKind, 'usgs');
  assert.deepEqual((await request(2, 'GET', '/api/topics')).json(), { topics: ['Earthquakes'] });
  assert.equal((await request(1, 'POST', path, settings)).statusCode, 409);
  assert.equal((await request(1, 'PATCH', `${path}/${feed.id}`, { sourceKind: 'rss' })).statusCode, 400);
  assert.equal((await request(1, 'PATCH', `${path}/${feed.id}`, { topic: 'Other' })).json().code, 'fixed_usgs_settings');
  const updated = (await request(1, 'PATCH', `${path}/${feed.id}`, { enabled: false, pollIntervalSeconds: 120 })).json();
  assert.equal(updated.pollIntervalSeconds, 120);
  assert.deepEqual((await request(2, 'GET', '/api/topics')).json(), { topics: [] });
});

test('baselines, applies activation, deduplicates revisions and sends occurrence time', async (t) => {
  let now = anchor;
  let entries = [event('old', anchor - 500)];
  const mail = [];
  const channel = createEmailChannel({ transport: { async sendMail(message) {
    mail.push(message);
    return { accepted: [message.to.address] };
  } } });
  const { app, request } = await createApiFixture(t, {
    now: () => now, usgsFetch: async () => response(...entries), channels: new Map([['email', channel]]),
  });
  const feed = (await request(1, 'POST', path, { sourceKind: 'usgs' })).json();
  const subscribe = () => request(2, 'POST', '/api/subscriptions', { topic: 'Earthquakes' });
  await subscribe();
  await app.services.pollFeeds();
  await app.services.deliver();
  assert.equal(mail.length, 0);
  await subscribe();
  now += minute;
  entries = [...entries, event('at-activation', anchor), event('quake', now), event('small', now, 4.4)];
  await app.services.pollFeeds();
  await app.services.deliver();
  assert.equal(mail.length, 1);
  assert.equal(mail[0].subject, 'M 4.6 earthquake · Test region');
  assert.match(mail[0].text, /Occurred \(UTC\): 2026-11-23T09:03:00.000Z/);
  assert.match(mail[0].text, /eventpage\/quake/);
  now += minute;
  entries = [event('replacement-id', anchor + minute, 4.8, ',quake,replacement-id,'), event('small', anchor + minute, 4.5)];
  await app.services.pollFeeds();
  await app.services.deliver();
  assert.equal(mail.length, 2);
  assert.match(mail[1].text, /eventpage\/small/);
  const url = `${path}/${feed.id}`;
  await request(1, 'PATCH', url, { enabled: false });
  now += minute;
  entries.push(event('disabled', now));
  await request(1, 'PATCH', url, { enabled: true });
  await app.services.pollFeeds();
  await app.services.deliver();
  assert.equal(mail.length, 2);
});

test('retries a failed catalog range using the previous successful scan without duplicating jobs', async (t) => {
  let now = anchor;
  const started = [];
  let fail = true;
  const { app, request } = await createApiFixture(t, { now: () => now, usgsFetch: async (target) => {
    const url = new URL(target);
    if (!url.searchParams.has('starttime')) return response();
    const from = Date.parse(url.searchParams.get('starttime'));
    started.push(from);
    if (from === anchor) return response(event('once', anchor + minute));
    if (fail) return new Response(null, { status: 503 });
    return response(event('later', anchor + day + minute));
  } });
  const feed = (await request(1, 'POST', path, { sourceKind: 'usgs' })).json();
  await request(2, 'POST', '/api/subscriptions', { topic: 'Earthquakes' });
  await app.services.pollFeeds();
  now += day + 2 * minute;
  await app.services.pollFeeds();
  assert.equal(app.services.feeds.get(feed.id).last_poll_success_at_ms, anchor);
  assert.match(app.services.feeds.get(feed.id).last_poll_error, /503/);
  assert.equal(app.services.queue.recent().length, 1);
  fail = false;
  now += 5_000;
  await app.services.pollFeeds();
  assert.deepEqual(started, [anchor, anchor + day, anchor, anchor + day]);
  assert.equal(app.services.feeds.get(feed.id).last_poll_success_at_ms, now);
  assert.equal(app.services.feeds.get(feed.id).last_poll_error, null);
  assert.equal(app.services.queue.recent().length, 2);
});
