import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { signIn, test } from './demo-fixture.mjs';

const evidence = process.env.SLACK_EVIDENCE_DIR;
const topic = 'World News';
const title = (demo) => `News ${new Date(demo.now()).toISOString()}`;

async function capture(page, name) {
  if (!evidence) return;
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: join(evidence, `${name}.png`), fullPage: true });
}

async function addTopic(admin, demo) {
  await signIn(admin, demo, demo.admin);
  await admin.getByRole('button', { name: 'Add source' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Add source' });
  await dialog.getByLabel('Feed URL').fill(demo.feedUrl);
  await dialog.getByLabel('Publisher').fill('Demo RSS');
  await dialog.getByLabel('Topic').fill(topic);
  await dialog.getByLabel('Polling interval (seconds)').fill('60');
  await dialog.getByRole('button', { name: 'Save source' }).click();
  await expect(dialog).toBeHidden();
  await demo.poll();
}

async function link(page) {
  await page.getByRole('button', { name: 'Connect Slack' }).click();
  await expect(page.getByText('Connected to workspace TDEMO as member UDEMO.')).toBeVisible();
  await expect(page).toHaveURL(/\/subscriptions$/);
}

test.use({ simulateSlack: true });

test('links Slack, saves both channels and exposes independent retry and sent outcomes', async ({ browser, page, demo }) => {
  const admin = await browser.newPage();
  try {
    await demo.stop();
    await demo.start();
    await addTopic(admin, demo);
    await signIn(page, demo, demo.user);
    await expect(page.getByRole('button', { name: 'Connect Slack' })).toBeVisible();
    await capture(page, '01-slack-disconnected');
    await page.getByRole('button', { name: 'Add subscription' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add subscription' });
    await expect(dialog.getByRole('checkbox', { name: 'Slack direct message' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    demo.cancelNextSlackConsent();
    await page.getByRole('button', { name: 'Connect Slack' }).click();
    await expect(page.getByRole('alert')).toContainText('Slack connection did not complete');
    await link(page);
    await page.getByRole('button', { name: 'Add subscription' }).click();
    await dialog.getByLabel('Topic').selectOption(topic);
    const email = dialog.getByRole('checkbox', { name: 'Email' });
    await expect(email).toBeChecked();
    await email.uncheck();
    await dialog.getByRole('button', { name: 'Save subscription' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Choose at least one delivery channel.');
    await email.check();
    await dialog.getByRole('checkbox', { name: 'Slack direct message' }).check();
    await capture(page, '02-add-subscription-channels');
    await dialog.getByRole('button', { name: 'Save subscription' }).click();
    await expect(page.getByRole('cell', { name: /Email.*Slack DM/ })).toBeVisible();
    await capture(page, '03-connected-subscription');
    demo.rateLimitNextSlackDelivery();
    demo.advance(60_000);
    const headline = title(demo);
    await demo.poll();
    await demo.deliver();
    expect(demo.slackMessages).toEqual([]);
    await expect.poll(async () => (await demo.messages()).map(({ Subject }) => Subject)).toEqual([headline]);
    await admin.getByRole('link', { name: 'Deliveries' }).click();
    await expect(admin.getByRole('row', { name: /Slack DM.*Retrying.*Slack rate limit/ })).toBeVisible();
    await expect(admin.getByRole('row', { name: /Email.*Sent/ })).toBeVisible();
    await capture(admin, '04-delivery-retrying');
    demo.advance(89_999);
    await demo.deliver();
    expect(demo.slackMessages).toEqual([]);
    demo.advance(1);
    await demo.deliver();
    expect(demo.slackMessages).toEqual([expect.objectContaining({
      channel: 'DDEMO', text: expect.stringContaining(headline),
    })]);
    await admin.reload();
    await expect(admin.getByRole('row', { name: /Slack DM.*Sent/ })).toBeVisible();
    await capture(admin, '05-delivery-sent');
  } finally {
    await admin.close();
  }
});

test('preserves Slack-only settings after disconnect and skips alerts from before reconnect', async ({ browser, page, demo }) => {
  const admin = await browser.newPage();
  try {
    await demo.stop();
    await demo.start();
    await addTopic(admin, demo);
    await signIn(page, demo, demo.user);
    await link(page);
    await page.getByRole('button', { name: 'Add subscription' }).click();
    const add = page.getByRole('dialog');
    await add.getByLabel('Topic').selectOption(topic);
    await add.getByRole('checkbox', { name: 'Email' }).uncheck();
    await add.getByRole('checkbox', { name: 'Slack direct message' }).check();
    await add.getByRole('button', { name: 'Save subscription' }).click();
    await expect(page.getByRole('cell', { name: 'Slack DM' })).toBeVisible();

    demo.advance(60_000);
    await demo.poll();
    await page.getByRole('button', { name: 'Disconnect Slack' }).click();
    await expect(page.getByRole('cell', { name: 'Slack needs connection' })).toBeVisible();
    await capture(page, '06-saved-slack-needs-connection');
    await demo.deliver();
    expect(demo.slackMessages).toEqual([]);
    demo.advance(60_000);
    await link(page);
    await demo.poll();
    await demo.deliver();
    expect(demo.slackMessages).toEqual([]);
    demo.advance(60_000);
    await demo.poll();
    await demo.deliver();
    expect(demo.slackMessages.map(({ text }) => text.split('\n')[0])).toEqual([title(demo)]);
    expect(await demo.messages()).toEqual([]);
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByRole('checkbox', { name: 'Email' })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Slack direct message' })).toBeChecked();
    await capture(page, '07-edit-slack-only-subscription');
  } finally {
    await admin.close();
  }
});
