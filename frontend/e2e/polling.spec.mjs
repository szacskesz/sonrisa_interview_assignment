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
