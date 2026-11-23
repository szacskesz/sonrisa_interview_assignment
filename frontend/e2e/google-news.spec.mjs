import { expect } from '@playwright/test';
import { signIn, test } from './demo-fixture.mjs';

const googleNewsUrl = 'https://news.google.com/rss?hl=hu&gl=HU&ceid=HU:hu';

test.skip(process.env.TEST_LIVE_RSS !== '1', 'Set TEST_LIVE_RSS=1 to verify the live Google News endpoint');

test('adds and polls the live Hungarian Google News feed', async ({ demo, page }) => {
  await signIn(page, demo, demo.admin);
  await page.getByRole('button', { name: 'Add source' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add source' });
  await dialog.getByLabel('Feed URL').fill(googleNewsUrl);
  await dialog.getByLabel('Publisher').fill('Google Hírek');
  await dialog.getByLabel('Topic').fill('Hungarian news');
  await dialog.getByRole('button', { name: 'Save source' }).click();
  await expect(dialog).toBeHidden();
  const row = page.getByRole('row').filter({ hasText: 'Google Hírek' });
  await expect(row.getByText(googleNewsUrl, { exact: true })).toBeVisible();
  await expect(row.getByText('Healthy', { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('link', { name: 'Deliveries' }).click();
  await expect(page.getByRole('heading', { name: 'No deliveries yet' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await signIn(page, demo, demo.user);
  await page.getByRole('button', { name: 'Add subscription' }).click();
  const subscription = page.getByRole('dialog', { name: 'Add subscription' });
  await subscription.getByRole('combobox', { name: 'Topic' }).selectOption('Hungarian news');
  await subscription.getByRole('button', { name: 'Save subscription' }).click();
  await expect(page.getByText('Subscription added.', { exact: true })).toBeVisible();
});
