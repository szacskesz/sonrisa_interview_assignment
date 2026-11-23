import { expect } from '@playwright/test';
import { account, configureFeed, minute, subjects, subscribe, title } from './demo-api.mjs';
import { signIn, test } from './demo-fixture.mjs';

test('E5 cancels an attempted delivery when the only matching subscription is paused or removed', async ({ demo }) => {
  await demo.stop();
  await demo.start();
  const admin = await account(demo, demo.admin);
  const user = await account(demo, demo.user);
  try {
    await configureFeed(demo, admin);
    await demo.poll();
    const { id } = await subscribe(user);
    const subscription = `/api/subscriptions/${id}`;
    const deliveries = async () => (await (await admin.get('/api/admin/deliveries')).json()).deliveries;
    for (const change of ['pause', 'remove']) {
      await test.step(`Cancel the retry after ${change}`, async () => {
        demo.advance(minute);
        const headline = title(Math.floor(demo.now() / minute) * minute);
        demo.failNextDelivery();
        await demo.poll();
        await demo.deliver();
        const job = (await deliveries()).find(({ title }) => title === headline);
        expect(job).toMatchObject({ status: 'pending', attemptCount: 1, lastError: 'Test SMTP interruption' });

        const response = change === 'pause'
          ? await user.patch(subscription, { data: { status: 'paused' } })
          : await user.delete(subscription);
        expect(response.status()).toBe(change === 'pause' ? 200 : 204);
        demo.advance(5_000);
        await demo.deliver();
        expect((await deliveries()).find(({ id }) => id === job.id)).toMatchObject({ status: 'canceled', attemptCount: 1 });
        expect(await demo.messages()).toHaveLength(0);

        if (change === 'pause') {
          expect((await user.patch(subscription, { data: { status: 'active' } })).status()).toBe(200);
        }
      });
    }
  } finally {
    await Promise.all([admin.dispose(), user.dispose()]);
  }
});

test('E2 switches topics in the browser and delivers only news after the new activation', async ({ demo, page }) => {
  await demo.stop();
  const markets = await demo.addFeed();
  await demo.start();
  const admin = await account(demo, demo.admin);
  const user = await account(demo, demo.user);
  try {
    await configureFeed(demo, admin, { publisher: 'World desk' });
    await configureFeed(demo, admin, { url: markets.url, topic: 'Markets', publisher: 'Markets desk' });
    await demo.poll();
    const subscription = await subscribe(user);
    demo.advance(minute);
    const first = title(demo.now());
    await demo.poll();
    await demo.deliver();
    expect(await subjects(demo)).toEqual([first]);

    // Leave two headlines unpolled, including one published exactly at the edit time.
    demo.advance(2 * minute);
    const editedAt = demo.now();
    await signIn(page, demo, demo.user);
    await page.getByRole('row').filter({ hasText: 'World News' }).getByRole('button', { name: 'Edit' }).click();
    const editor = page.getByRole('dialog', { name: 'Edit subscription' });
    await editor.getByRole('combobox', { name: 'Topic' }).selectOption('Markets');
    await editor.getByRole('button', { name: 'Save subscription' }).click();
    await expect(page.getByText('Subscription updated.')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Markets', exact: true })).toBeVisible();
    expect(await (await user.get('/api/subscriptions')).json()).toEqual({
      subscriptions: [{ ...subscription, topic: 'Markets', activatedAt: editedAt }],
    });

    demo.advance(minute);
    const next = title(demo.now());
    await demo.poll();
    await demo.deliver();
    expect(await subjects(demo)).toEqual([first, next]);
    const { deliveries } = await (await admin.get('/api/admin/deliveries')).json();
    expect(deliveries).toMatchObject([
      { title: next, publisher: 'Markets desk', status: 'sent', attemptCount: 1 },
      { title: first, publisher: 'World desk', status: 'sent', attemptCount: 1 },
    ]);
    const email = (await demo.messages()).find(({ Subject }) => Subject === next);
    expect((await demo.message(email.ID)).Text).toContain('Topic: Markets');
  } finally {
    await Promise.all([admin.dispose(), user.dispose()]);
  }
});
