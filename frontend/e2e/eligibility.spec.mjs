import { expect } from '@playwright/test';
import { account, configureFeed, minute, subscribe, title } from './demo-api.mjs';
import { test } from './demo-fixture.mjs';

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
