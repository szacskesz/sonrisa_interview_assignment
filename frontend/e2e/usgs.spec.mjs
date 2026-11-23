import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { usgsSource } from '../../backend/src/usgs-source.js';
import { minute } from './demo-api.mjs';
import { initialTime, signIn, test } from './demo-fixture.mjs';

const evidenceDirectory = process.env.USGS_EVIDENCE_DIR;
const event = (id, time, mag = 5.2) => ({
  type: 'Feature', id, properties: { type: 'earthquake', time, updated: time, mag, place: 'Demo region', ids: id },
});

const controlled = test.extend({
  async earthquakes({}, use) {
    let features = [event('baseline', initialTime - minute)];
    await use({
      add(item) { features = [...features, item]; },
      async fetch(url) {
        expect(String(url)).toBe(usgsSource.url);
        return Response.json({ type: 'FeatureCollection', features });
      },
    });
  },
  usgsFetch: ({ earthquakes }, use) => use(earthquakes.fetch),
});

async function screenshot(page, name) {
  if (!evidenceDirectory) return;
  await mkdir(evidenceDirectory, { recursive: true });
  await page.screenshot({ path: join(evidenceDirectory, `usgs-${name}.png`), animations: 'disabled', fullPage: true });
}

async function addSource(page) {
  await page.getByRole('button', { name: 'Add source' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add source' });
  await dialog.getByRole('combobox', { name: 'Source type' }).selectOption('usgs');
  await expect(dialog.getByLabel('Polling interval (seconds)')).toHaveValue('60');
  await expect(dialog.getByLabel('Feed URL')).toHaveCount(0);
  await screenshot(page, 'add-source');
  await dialog.getByRole('button', { name: 'Save source' }).click();
  await expect(dialog).toBeHidden();
  return page.getByRole('row').filter({ hasText: 'USGS Earthquakes' });
}

controlled('delivers a qualifying USGS earthquake from Sources to Mailpit', async ({ browser, page, demo, earthquakes }) => {
  await demo.stop();
  await demo.start();
  await signIn(page, demo, demo.admin);
  const source = await addSource(page);
  const subscriber = await browser.newPage();
  try {
    await signIn(subscriber, demo, demo.user);
    await subscriber.getByRole('button', { name: 'Add subscription' }).click();
    const subscription = subscriber.getByRole('dialog', { name: 'Add subscription' });
    await subscription.getByRole('combobox', { name: 'Topic' }).selectOption('Earthquakes');
    await subscription.getByRole('button', { name: 'Save subscription' }).click();
    await expect(subscriber.getByRole('cell', { name: 'Earthquakes', exact: true })).toBeVisible();
    await screenshot(subscriber, 'subscription');
  } finally {
    await subscriber.close();
  }
  await demo.poll();
  await demo.deliver();
  expect(await demo.messages()).toHaveLength(0);
  await page.reload();
  await expect(source.getByText('Healthy', { exact: true })).toBeVisible();
  await screenshot(page, 'source-health');
  await source.getByRole('button', { name: 'Edit' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit source' });
  await expect(edit.getByRole('combobox')).toHaveCount(0);
  await screenshot(page, 'edit-source');
  await edit.getByRole('button', { name: 'Cancel' }).click();

  demo.advance(minute);
  earthquakes.add(event('below-threshold', demo.now(), 4.4));
  earthquakes.add(event('demo-quake', demo.now()));
  await demo.poll();
  await demo.deliver();
  const subject = 'M 5.2 earthquake · Demo region';
  await expect.poll(async () => (await demo.messages()).map(({ Subject }) => Subject)).toEqual([subject]);
  const [message] = await demo.messages();
  const { Text } = await demo.message(message.ID);
  expect(Text).toContain('Occurred (UTC): 2026-11-23T09:03:00.000Z');
  expect(Text).toContain('https://earthquake.usgs.gov/earthquakes/eventpage/demo-quake');
  await page.getByRole('link', { name: 'Deliveries' }).click();
  await expect(page.getByRole('row').filter({ hasText: subject }).getByText('Sent', { exact: true })).toBeVisible();
  await screenshot(page, 'delivery');

  if (evidenceDirectory) {
    const mailbox = await browser.newPage();
    try {
      const inbox = process.env.TEST_MAILPIT_URL ?? 'http://127.0.0.1:18025';
      await mailbox.goto(new URL(`/view/${message.ID}`, inbox).href);
      await expect(mailbox.getByRole('tabpanel', { name: 'Text' })).toContainText('Occurred (UTC)');
      await screenshot(mailbox, 'mailpit');
    } finally {
      await mailbox.close();
    }
  }
});

test.describe('live USGS', () => {
  test.skip(process.env.TEST_LIVE_USGS !== '1', 'Set TEST_LIVE_USGS=1 to verify the public USGS endpoint');

  test('polls the built-in USGS feed from the admin Sources page', async ({ page, demo }) => {
    await signIn(page, demo, demo.admin);
    const source = await addSource(page);
    await expect(source.getByText(usgsSource.url, { exact: true })).toBeVisible();
    await expect(source.getByText('Healthy', { exact: true })).toBeVisible({ timeout: 20_000 });
  });
});
