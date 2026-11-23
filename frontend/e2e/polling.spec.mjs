import { expect } from '@playwright/test';
import { account, configureFeed, minute, subjects, subscribe, title } from './demo-api.mjs';
import { signIn, test } from './demo-fixture.mjs';

test('E3 resumes at the committed checkpoint after a replay page returns HTTP 503', async ({ demo, page }) => {
  await demo.stop();
  await demo.start();
  const admin = await account(demo, demo.admin);
  const user = await account(demo, demo.user);
  try {
    const start = demo.now();
    await configureFeed(demo, admin);
    await demo.poll();
    await subscribe(user);
    const feedState = async () => (await (await admin.get('/api/admin/feeds')).json()).feeds[0];

    demo.advance(5 * minute);
    const failedAt = demo.now();
    const iso = (offset) => new Date(start + offset * minute).toISOString();
    demo.feed.failPageAfter(start + 2 * minute);
    await demo.poll();
    await demo.deliver();
    expect(await feedState()).toMatchObject({
      lastPollSuccessAt: start, lastPollAttemptAt: failedAt, lastPollError: 'RSS request returned HTTP 503',
      nextPollAt: failedAt + 5_000,
    });
    expect(demo.feed.requests).toEqual([
      { after: null, through: null },
      { after: null, through: null },
      { after: iso(0), through: iso(5) },
      { after: iso(2), through: iso(5) },
    ]);
    expect(await subjects(demo)).toEqual([1, 2].map((offset) => title(start + offset * minute)));
    await signIn(page, demo, demo.admin);
    await expect(page.getByText('Poll failed', { exact: true })).toBeVisible();
    await expect(page.getByText('RSS request returned HTTP 503')).toBeVisible();

    demo.advance(4_999);
    await demo.poll();
    expect(demo.feed.requests).toHaveLength(4);
    demo.advance(1);
    await demo.poll();
    await demo.deliver();
    expect(demo.feed.requests.slice(4)).toEqual([
      { after: null, through: null },
      { after: iso(2), through: iso(5) },
      { after: iso(4), through: iso(5) },
    ]);
    expect(await feedState()).toMatchObject({ lastPollSuccessAt: demo.now(), lastPollError: null });
    await page.reload();
    await expect(page.getByText('Healthy', { exact: true })).toBeVisible();
    const { deliveries } = await (await admin.get('/api/admin/deliveries')).json();
    expect(deliveries).toHaveLength(5);
    expect(deliveries.every(({ status, attemptCount }) => status === 'sent' && attemptCount === 1)).toBe(true);
    expect(await subjects(demo)).toEqual([1, 2, 3, 4, 5].map((offset) => title(start + offset * minute)));
  } finally {
    await Promise.all([admin.dispose(), user.dispose()]);
  }
});

test('E1 polls each feed once per cycle as subscribers grow and routes alerts by topic', async ({ demo }) => {
  await demo.stop();
  const second = await demo.addFeed();
  const third = await demo.addFeed();
  await demo.start();
  const admin = await account(demo, demo.admin);
  const user = await account(demo, demo.user);
  const other = await account(demo, demo.lateUser);

  async function inbox(address) {
    const messages = await demo.messages(address);
    return (await Promise.all(messages.map(async ({ ID, Subject }) => {
      const { Text } = await demo.message(ID);
      const source = Text.split(/\r?\n/).find((line) => line.startsWith('Source: '));
      return `${Subject} | ${source}`;
    }))).sort();
  }

  try {
    const start = demo.now();
    await configureFeed(demo, admin, { publisher: 'World A' });
    await configureFeed(demo, admin, { url: second.url, publisher: 'World B' });
    await configureFeed(demo, admin, { url: third.url, publisher: 'Markets C', topic: 'Markets' });
    await demo.poll();
    await subscribe(user);
    demo.advance(minute);
    await demo.poll();
    await demo.deliver();
    const world = (headline) => [`${headline} | Source: World A`, `${headline} | Source: World B`];
    const first = title(demo.now());
    expect(await inbox(demo.user)).toEqual(world(first));
    expect(await inbox(demo.lateUser)).toEqual([]);

    await subscribe(other);
    await subscribe(other, 'Markets');
    demo.advance(minute);
    await demo.poll();
    await demo.deliver();
    const next = title(demo.now());
    expect(await inbox(demo.user)).toEqual([...world(first), ...world(next)]);
    expect(await inbox(demo.lateUser)).toEqual([`${next} | Source: Markets C`, ...world(next)]);

    const iso = (offset) => new Date(start + offset * minute).toISOString();
    for (const feed of [demo.feed, second, third]) {
      expect(feed.requests).toEqual([
        { after: null, through: null },
        { after: null, through: null }, { after: iso(0), through: iso(1) },
        { after: null, through: null }, { after: iso(1), through: iso(2) },
      ]);
    }
  } finally {
    await Promise.all([admin.dispose(), user.dispose(), other.dispose()]);
  }
});
