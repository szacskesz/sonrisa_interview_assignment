import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchPublicRss } from '../src/rss-http.js';

test('keeps RSS query parameters and follows a public redirect', async () => {
  const urls = [];
  const response = await fetchPublicRss('https://news.example.test/feed?region=HU', {}, async (url, options) => {
    urls.push(url.href);
    assert.equal(options.redirect, 'manual');
    if (urls.length === 1) return new Response(null, { status: 302, headers: { location: '/rss?region=HU' } });
    return new Response('RSS');
  });
  assert.deepEqual(urls, ['https://news.example.test/feed?region=HU', 'https://news.example.test/rss?region=HU']);
  assert.equal(await response.text(), 'RSS');
});

test('rejects nonpublic IP literals without making the request, including redirect destinations', async () => {
  const unexpected = () => assert.fail('A nonpublic destination must not be fetched');
  await assert.rejects(fetchPublicRss('http://127.0.0.1/feed', {}, unexpected), /public network address/);
  await assert.rejects(fetchPublicRss('http://[::1]/feed', {}, unexpected), /public network address/);
  let requests = 0;
  await assert.rejects(fetchPublicRss('https://news.example.test/feed', {}, async () => {
    requests += 1;
    return new Response(null, { status: 302, headers: { location: 'http://192.168.0.1/feed' } });
  }), /public network address/);
  assert.equal(requests, 1);
});
