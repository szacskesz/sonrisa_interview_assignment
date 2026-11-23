import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUsgsSource, usgsSource } from '../src/usgs-source.js';

const start = Date.parse('2026-11-23T09:02:00Z');
const day = 86_400_000;
const feature = (id, props = {}) => ({
  id, type: 'Feature',
  properties: { type: 'earthquake', mag: 4.5, place: 'Test region', time: start, updated: start, ...props },
});
const response = (features) => Response.json({ type: 'FeatureCollection', features });

async function pages(source, after, through = start) {
  const batches = [];
  for await (const batch of source.scan({ after, through })) batches.push(batch);
  return batches;
}

test('reads live USGS data, filters events, and keeps the latest version of each ID in a batch', async () => {
  const source = createUsgsSource({ fetchFeed: async (url) => {
    assert.equal(url, usgsSource.url);
    return response([
      feature('quake'), feature('small', { mag: 4.4 }), feature('blast', { type: 'explosion' }),
      feature('quake', { mag: 4.8, updated: start + 1, ids: ',old-id,quake,' }),
    ]);
  } });
  assert.deepEqual(await pages(source, null), [[{
    id: 'quake', aliases: ['old-id', 'quake'], title: 'M 4.8 earthquake · Test region',
    publishedAt: start, updatedAt: start + 1, url: 'https://earthquake.usgs.gov/earthquakes/eventpage/quake',
  }]]);
  assert.equal((await pages(source, start - day + 1))[0].length, 1);
});

test('splits catalog catch-up into contiguous bounded windows and paginates raw results', async () => {
  const requests = [];
  const source = createUsgsSource({ fetchFeed: async (url) => {
    requests.push(new URL(url));
    if (requests.length === 1) return response(Array.from({ length: 200 }, (_, index) => feature(String(index))));
    return new Response(null, { status: 204 });
  } });
  const after = start - day - 2;
  assert.deepEqual((await pages(source, after)).map((batch) => batch.length), [200, 0, 0]);
  for (const url of requests) {
    assert.equal(url.pathname, '/fdsnws/event/1/query');
    assert.equal(url.searchParams.get('minmagnitude'), '4.5');
    assert.equal(url.searchParams.get('eventtype'), 'earthquake');
  }
  assert.deepEqual(requests.map((url) => url.searchParams.get('offset')), ['1', '201', '1']);
  assert.equal(Date.parse(requests[0].searchParams.get('starttime')), after);
  assert.equal(Date.parse(requests[1].searchParams.get('endtime')), after + day - 1);
  assert.equal(Date.parse(requests[2].searchParams.get('starttime')), after + day);
  assert.equal(Date.parse(requests[2].searchParams.get('endtime')), start);
});

test('reports HTTP errors and rejects malformed USGS data', async () => {
  for (const [makeResponse, message] of [
    [() => new Response('unavailable', { status: 503 }), /HTTP 503/],
    [() => Response.json({ features: [] }), /FeatureCollection/],
    [() => response([feature('quake', { time: 'invalid' })]), /valid ID or timestamp/],
  ]) {
    const source = createUsgsSource({ fetchFeed: async () => makeResponse() });
    await assert.rejects(pages(source, null), message);
  }
});
