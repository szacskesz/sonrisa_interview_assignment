import { expect } from '@playwright/test';
import { signIn, test } from './demo-fixture.mjs';

test('a configured RSS topic produces a real email and a visible admin result', async ({ browser, demo }) => {
  const admin = await browser.newPage();
  const user = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const title = () => `News ${new Date(demo.now()).toISOString()}`;
  try {
    await signIn(admin, demo, demo.admin);
    await expect(admin.getByRole('heading', { name: 'Sources', exact: true })).toBeVisible();
    await admin.getByRole('button', { name: 'Add source' }).click();
    const feedDialog = admin.getByRole('dialog', { name: 'Add source' });
    await feedDialog.getByLabel('Feed URL').fill(demo.feedUrl);
    await feedDialog.getByLabel('Publisher').fill('Sonrisa Demo News');
    await feedDialog.getByLabel('Topic').fill('World News');
    await feedDialog.getByLabel('Polling interval (seconds)').fill('60');
    await feedDialog.getByRole('button', { name: 'Save source' }).click();
    await expect(feedDialog).toBeHidden();
    await expect(admin.getByText('Source added.')).toBeVisible();
    await expect(admin.getByText('Healthy')).toBeVisible();

    await signIn(user, demo, demo.user, 'incorrect-password');
    await expect(user.getByRole('alert')).toHaveText('Email or password is incorrect');
    await user.getByLabel('Password').fill(demo.password);
    await user.getByRole('button', { name: 'Sign in' }).click();
    await expect(user.getByRole('heading', { name: 'Subscriptions', exact: true })).toBeVisible();
    await user.getByRole('button', { name: 'Add subscription' }).click();
    const subscription = user.getByRole('dialog', { name: 'Add subscription' });
    await subscription.getByRole('combobox', { name: 'Topic' }).selectOption('World News');
    await subscription.getByRole('button', { name: 'Save subscription' }).click();
    await expect(user.getByRole('row', { name: /World News.*Active/ })).toBeVisible();
    await expect.poll(async () => user.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await expect(user.getByRole('link', { name: 'Sources' })).toHaveCount(0);
    await user.goto(`${demo.url}/admin/deliveries`);
    await expect(user.getByRole('heading', { name: 'Access denied' })).toBeVisible();
    await user.getByRole('button', { name: 'Sign out' }).click();
    await expect(user.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await user.close();

    expect(await demo.messages()).toHaveLength(0);
    await admin.getByRole('link', { name: 'Deliveries' }).click();
    await expect(admin.getByRole('heading', { name: 'No deliveries yet' })).toBeVisible();
    demo.advance(60_000);
    await expect.poll(async () => (await demo.messages()).map(({ Subject }) => Subject)).toEqual([title()]);
    const [received] = await demo.messages();
    const { Text } = await demo.message(received.ID);
    expect(Text.trim().split(/\r?\n/).slice(0, 3)).toEqual([title(), 'Topic: World News', 'Source: Sonrisa Demo News']);
    const row = admin.getByRole('row', { name: /News .*Sonrisa Demo News.*Sent/ });
    await expect(row.getByRole('cell', { name: title(), exact: true })).toBeVisible();
    await expect(row.getByRole('cell', { name: '1', exact: true })).toBeVisible();
  } finally {
    await admin.close();
    await user.close();
  }
});
