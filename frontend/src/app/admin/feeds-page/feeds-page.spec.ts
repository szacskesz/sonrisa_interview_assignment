import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { settle, stubDialogs } from '../../testing/dom';
import { FeedRecord, FeedsApi } from '../feeds-api';
import { FeedsPage } from './feeds-page';

const feed: FeedRecord = { id: 1, url: 'http://127.0.0.1:18080/rss.xml', publisher: 'Demo RSS',
  topic: 'World', pollIntervalSeconds: 60, enabled: true, nextPollAt: 100,
  lastPollAttemptAt: null, lastPollSuccessAt: null, lastPollError: null };

function setup() {
  const api = {
    list: vi.fn<() => Promise<FeedRecord[]>>().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(feed),
    update: vi.fn(),
  };
  TestBed.configureTestingModule({ imports: [FeedsPage], providers: [{ provide: FeedsApi, useValue: api }] });
  const fixture = TestBed.createComponent(FeedsPage);
  const root: HTMLElement = fixture.nativeElement;
  const button = (label: string) => Array.from(root.querySelectorAll('button'))
    .find((element) => element.textContent?.trim() === label)!;
  const stable = () => settle(fixture);
  return { api, root, button, stable };
}

describe('RSS feeds page', () => {
  it('adds a feed, edits its polling interval, and disables or re-enables it', async () => {
    const { api, root, button, stable } = setup();
    await stable();
    stubDialogs(root);
    button('Add feed').click();
    await stable();
    const dialog = root.querySelector<HTMLDialogElement>('dialog')!;
    const inputs = [...dialog.querySelectorAll('input')];
    const change = (index: number, value: string) => {
      inputs[index].value = value;
      inputs[index].dispatchEvent(new Event('input'));
    };
    const save = () => dialog.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    change(0, feed.url);
    change(1, feed.publisher);
    change(2, feed.topic);
    change(3, '1.5');
    save();
    await stable();
    expect(api.create).not.toHaveBeenCalled();
    change(3, '60');
    api.create.mockRejectedValueOnce(new HttpErrorResponse({
      status: 409, error: { code: 'duplicate_feed_url', message: 'That RSS URL is already configured' },
    }));
    save();
    await stable();
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('That RSS URL is already configured');
    save();
    await stable();
    expect(api.create).toHaveBeenLastCalledWith({
      url: feed.url, topic: feed.topic, publisher: feed.publisher, enabled: true, pollIntervalSeconds: 60,
    });
    expect(root.querySelector('tbody')?.textContent).toContain('Waiting');

    button('Edit').click();
    await stable();
    change(3, '120');
    api.update.mockResolvedValueOnce({ ...feed, pollIntervalSeconds: 120, lastPollSuccessAt: 50 });
    save();
    await stable();
    expect(api.update).toHaveBeenLastCalledWith(feed.id, expect.objectContaining({ pollIntervalSeconds: 120 }));
    expect(root.querySelector('tbody')?.textContent).toContain('Healthy');
    api.update.mockResolvedValueOnce({ ...feed, enabled: false }).mockResolvedValueOnce(feed);
    button('Disable').click();
    await stable();
    expect(root.querySelector('tbody')?.textContent).toContain('Disabled');
    button('Enable').click();
    await stable();
    expect(api.update).toHaveBeenLastCalledWith(feed.id, { enabled: true });
  });

  it('shows a load failure and displays poll diagnostics after retry', async () => {
    const { api, root, button, stable } = setup();
    api.list.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([{ ...feed, lastPollError: 'Feed timed out', lastPollAttemptAt: 50 }]);
    await stable();
    expect(root.textContent).toContain('RSS feeds unavailable');
    button('Try again').click();
    await stable();
    expect(root.querySelector('tbody')?.textContent).toContain('Poll failed');
    expect(root.querySelector('tbody')?.textContent).toContain('Feed timed out');
  });
});
