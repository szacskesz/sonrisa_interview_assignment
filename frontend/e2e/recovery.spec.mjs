import { expect } from '@playwright/test';
import { account, configureFeed, minute, subjects, subscribe, title } from './demo-api.mjs';
import { signIn, test } from './demo-fixture.mjs';

test('replays all missed news after restart, respects activation and retries a failure once', async ({ demo }) => {
  const admin = await account(demo, demo.admin);
  const user = await account(demo, demo.user);
  const late = await account(demo, demo.lateUser);
  try {
    const start = demo.now();
    const feed = await configureFeed(demo, admin);
    await expect.poll(async () => (await (await admin.get('/api/admin/feeds')).json()).feeds[0]?.lastPollSuccessAt).toBe(start);
    await subscribe(user);
    await subscribe(user);
    expect(await subjects(demo)).toEqual([]);

    await demo.stop();
    demo.advance(5 * minute);
    await demo.start();
    await subscribe(late);
    const settings = await admin.patch(`/api/admin/feeds/${feed.id}`, { data: { pollIntervalSeconds: 1 } });
    expect(settings.ok()).toBe(true);
    demo.advance(minute);
    demo.failNextDelivery();
    await demo.poll();
    await demo.deliver();
    const failure = (await (await admin.get('/api/admin/deliveries')).json()).deliveries
      .find(({ status }) => status === 'pending');
    expect(failure).toMatchObject({ title: title(start + minute), status: 'pending', attemptCount: 1,
      lastError: 'Test SMTP interruption' });
    expect(await subjects(demo)).toEqual([2, 3, 4, 5, 6].map((offset) => title(start + offset * minute)));
    expect(await subjects(demo, demo.lateUser)).toEqual([title(start + 6 * minute)]);

    await demo.stop();
    demo.advance(5_000);
    await demo.start();
    await demo.deliver();
    await demo.poll();
    await demo.deliver();
    const { deliveries } = await (await admin.get('/api/admin/deliveries')).json();
    expect(deliveries).toHaveLength(7);
    expect(deliveries.find(({ id }) => id === failure.id)).toMatchObject({ status: 'sent', attemptCount: 2, lastError: null });
    expect(await subjects(demo)).toEqual([1, 2, 3, 4, 5, 6].map((offset) => title(start + offset * minute)));
    expect(await subjects(demo, demo.lateUser)).toEqual([title(start + 6 * minute)]);
  } finally {
    await Promise.all([admin.dispose(), user.dispose(), late.dispose()]);
  }
});

test('starts fresh after re-enabling and skips news while paused or after removal', async ({ demo, page }) => {
  const admin = await account(demo, demo.admin);
  const user = await account(demo, demo.user);
  try {
    const feed = await configureFeed(demo, admin);
    const feedRoute = `/api/admin/feeds/${feed.id}`;
    await demo.poll();
    await subscribe(user);
    await demo.stop();
    await demo.start();
    expect((await admin.patch(feedRoute, { data: { enabled: false } })).ok()).toBe(true);
    demo.advance(3 * minute);
    await demo.poll();
    expect(await (await admin.get('/api/topics')).json()).toEqual({ topics: [] });
    expect((await admin.patch(feedRoute, { data: { enabled: true, pollIntervalSeconds: 1 } })).ok()).toBe(true);
    await demo.poll();
    await demo.deliver();
    expect(await subjects(demo)).toEqual([]);
    demo.advance(minute);
    await demo.poll();
    await demo.deliver();
    const first = title(demo.now());
    expect(await subjects(demo)).toEqual([first]);

    await signIn(page, demo, demo.user);
    await expect(page.getByRole('heading', { name: 'Subscriptions', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByText('Subscription paused.')).toBeVisible();
    demo.advance(minute);
    await demo.poll();
    await demo.deliver();
    expect(await subjects(demo)).toEqual([first]);
    await page.getByRole('button', { name: 'Resume' }).click();
    await expect(page.getByText('Subscription resumed.')).toBeVisible();
    demo.advance(minute);
    await demo.poll();
    await demo.deliver();
    const second = title(demo.now());
    expect(await subjects(demo)).toEqual([first, second]);

    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: 'Remove subscription?' });
    await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(confirm).toBeHidden();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await confirm.getByRole('button', { name: 'Remove subscription' }).click();
    await expect(page.getByRole('heading', { name: 'No subscriptions yet' })).toBeVisible();
    demo.advance(minute);
    await demo.poll();
    await demo.deliver();
    expect(await subjects(demo)).toEqual([first, second]);
  } finally {
    await Promise.all([admin.dispose(), user.dispose()]);
  }
});

test('validates admin feed changes and returns to sign-in when the cookie expires', async ({ demo, page }) => {
  const admin = await account(demo, demo.admin);
  try {
    await configureFeed(demo, admin);
    await signIn(page, demo, demo.admin);
    await expect(page.getByText('Every 60 seconds')).toBeVisible();
    await page.getByRole('button', { name: 'Add feed' }).click();
    const create = page.getByRole('dialog', { name: 'Add feed' });
    await create.getByLabel('Feed URL').fill(demo.feedUrl);
    await create.getByLabel('Publisher').fill('Duplicate publisher');
    await create.getByLabel('Topic').fill('Duplicate topic');
    await create.getByRole('button', { name: 'Save feed' }).click();
    await expect(create.getByRole('alert')).toHaveText('That RSS URL is already configured');
    await create.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Edit' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit feed' });
    await edit.getByLabel('Polling interval (seconds)').fill('120');
    await edit.getByRole('button', { name: 'Save feed' }).click();
    await expect(page.getByText('Every 120 seconds')).toBeVisible();
    await page.getByRole('button', { name: 'Disable' }).click();
    await expect(page.getByRole('cell', { name: /Disabled/ })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Enable', exact: true }).click();
    await expect(page.getByText('Feed enabled.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Disable' })).toBeVisible();
    await page.context().clearCookies();
    await expect(page.getByText('Your session expired. Sign in again to continue.')).toBeVisible();
  } finally {
    await admin.dispose();
  }
});
