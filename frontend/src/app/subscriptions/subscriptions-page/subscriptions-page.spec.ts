import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Session } from '../../core/session';
import { settle, stubDialogs } from '../../testing/dom';
import { SlackApi, SlackStatus } from '../slack-api';
import { SubscriptionRecord, SubscriptionsApi } from '../subscriptions-api';
import { SubscriptionsPage } from './subscriptions-page';

const row: SubscriptionRecord = {
  id: 1, topic: 'World', status: 'active', channels: ['email'],
  destination: 'user@example.test', createdAt: 1, activatedAt: 1,
};

function setup() {
  const api = {
    list: vi.fn<() => Promise<SubscriptionRecord[]>>().mockResolvedValue([]),
    listTopics: vi.fn<() => Promise<string[]>>().mockResolvedValue(['World', 'Markets']),
    create: vi.fn().mockResolvedValue(row),
    update: vi.fn(),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  const slack = {
    status: vi.fn<() => Promise<SlackStatus>>().mockResolvedValue({ available: true, connection: null }),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    imports: [SubscriptionsPage],
    providers: [
      provideRouter([]),
      { provide: SubscriptionsApi, useValue: api },
      { provide: SlackApi, useValue: slack },
      { provide: Session, useValue: { account: signal({ id: 2, email: row.destination, role: 'user' }) } },
    ],
  });
  const fixture = TestBed.createComponent(SubscriptionsPage);
  const root: HTMLElement = fixture.nativeElement;
  const button = (label: string, area = root) => Array.from(area.querySelectorAll('button'))
    .find((element) => element.textContent?.trim() === label)!;
  const submit = (area: Element) => area.querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  const settled = () => settle(fixture);
  return { api, slack, root, button, submit, settled };
}

describe('Subscriptions page', () => {
  it('adds, edits, pauses, resumes and confirms removal', async () => {
    const { settled, root, api, button, submit } = setup();
    await settled();
    expect(root.textContent).toContain('No subscriptions yet');
    stubDialogs(root);
    button('Add subscription').click();
    await settled();
    const editor = root.querySelector<HTMLDialogElement>('dialog')!;
    expect(editor.open).toBe(true);
    const select = editor.querySelector('select')!;
    select.value = 'World';
    select.dispatchEvent(new Event('input'));
    submit(editor);
    await settled();
    expect(api.create).toHaveBeenCalledWith('World', ['email']);
    expect(root.textContent).toContain('Subscription added.');

    api.update.mockResolvedValueOnce({ ...row, topic: 'Markets', activatedAt: 2 });
    button('Edit').click();
    await settled();
    expect(select.value).toBe('World');
    select.value = 'Markets';
    select.dispatchEvent(new Event('input'));
    submit(editor);
    await settled();
    expect(api.update).toHaveBeenLastCalledWith(row.id, { topic: 'Markets', channels: ['email'] });

    api.update.mockResolvedValueOnce({ ...row, topic: 'Markets', status: 'paused' }).mockResolvedValueOnce(row);
    button('Pause').click();
    await settled();
    expect(api.update).toHaveBeenLastCalledWith(row.id, { status: 'paused' });
    button('Resume').click();
    await settled();
    expect(api.update).toHaveBeenLastCalledWith(row.id, { status: 'active' });

    button('Remove').click();
    await settled();
    const confirmation = root.querySelector<HTMLDialogElement>('dialog[open]')!;
    expect(confirmation.textContent).toContain('Remove subscription?');
    button('Cancel', confirmation).click();
    expect(api.remove).not.toHaveBeenCalled();
    button('Remove').click();
    submit(confirmation);
    await settled();
    expect(api.remove).toHaveBeenCalledWith(row.id);
    expect(root.textContent).toContain('No subscriptions yet');
  });

  it('allows retry after a load failure and keeps existing rows visible without available topics', async () => {
    const { settled, api, root, button } = setup();
    api.listTopics.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue([]);
    api.list.mockResolvedValue([row]);
    await settled();
    expect(root.textContent).toContain('Subscriptions unavailable');
    button('Try again').click();
    await settled();
    expect(button('Add subscription').disabled).toBe(true);
    expect(root.textContent).toContain('No topics are available');
    expect(root.querySelector('tbody')?.textContent).toContain('World');
    expect(button('Pause').disabled).toBe(false);
  });

  it('keeps disconnected Slack preferences visible and prevents saving an empty selection', async () => {
    const { settled, root, api, slack, button, submit } = setup();
    api.list.mockResolvedValue([{ ...row, channels: ['slack'] }]);
    slack.status.mockResolvedValue({ available: true, connection: { workspaceId: 'T123', memberId: 'U123' } });
    await settled();
    expect(root.textContent).toContain('Connected to workspace T123');
    button('Disconnect Slack').click();
    await settled();
    expect(slack.disconnect).toHaveBeenCalledOnce();
    expect(root.textContent).toContain('Slack needs connection');
    stubDialogs(root);
    button('Edit').click();
    await settled();
    const dialog = root.querySelector<HTMLDialogElement>('dialog[open]')!;
    const [, slackCheckbox] = dialog.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    expect(slackCheckbox.checked).toBe(true);
    slackCheckbox.click();
    submit(dialog);
    await settled();
    expect(dialog.textContent).toContain('Choose at least one delivery channel.');
    expect(api.update).not.toHaveBeenCalled();
  });
});
