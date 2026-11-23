import { expect } from '@playwright/test';
import { account, configureFeed, subscribe } from './demo-api.mjs';
import { test } from './demo-fixture.mjs';

test('E7 enforces subscription ownership and admin permissions over HTTP', async ({ demo }) => {
  await demo.stop();
  await demo.start();
  const admin = await account(demo, demo.admin);
  const owner = await account(demo, demo.user);
  const other = await account(demo, demo.lateUser);
  try {
    const feed = await configureFeed(demo, admin);
    const theirs = await subscribe(owner);
    const own = await subscribe(other);
    const ownedRoute = `/api/subscriptions/${theirs.id}`;

    expect(await (await other.get('/api/subscriptions')).json()).toEqual({ subscriptions: [own] });
    const edit = await other.patch(ownedRoute, { data: { status: 'paused' } });
    const removal = await other.delete(ownedRoute);
    for (const response of [edit, removal]) {
      expect(response.status()).toBe(404);
      expect(await response.json()).toMatchObject({ code: 'subscription_not_found' });
    }
    expect(await (await owner.get('/api/subscriptions')).json()).toEqual({ subscriptions: [theirs] });
    expect(await (await other.get('/api/subscriptions')).json()).toEqual({ subscriptions: [own] });

    const feeds = '/api/admin/feeds';
    const deliveries = '/api/admin/deliveries';
    const attempts = [
      await other.get(feeds),
      await other.post(feeds, { data: { url: demo.feedUrl, publisher: 'Other publisher', topic: 'Other topic' } }),
      await other.patch(`${feeds}/${feed.id}`, { data: { enabled: false } }),
      await other.get(deliveries),
    ];
    for (const response of attempts) {
      expect(response.status()).toBe(403);
      expect(await response.json()).toMatchObject({ code: 'forbidden' });
    }
    expect(await (await admin.get(feeds)).json()).toEqual({ feeds: [feed] });
    expect(await (await admin.get(deliveries)).json()).toEqual({ deliveries: [] });
  } finally {
    await Promise.all([admin.dispose(), owner.dispose(), other.dispose()]);
  }
});
