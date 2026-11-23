import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { apiError } from '../core/api-error';
import { FeedRecord, FeedSettings, FeedsApi } from './feeds-api';

describe('FeedsApi', () => {
  const path = '/api/admin/feeds';
  const settings: FeedSettings = { url: 'http://127.0.0.1:18080/rss.xml', publisher: 'Demo RSS',
    topic: 'World', enabled: true, pollIntervalSeconds: 60 };
  const feed: FeedRecord = { ...settings, id: 1, nextPollAt: 123, lastPollAttemptAt: null,
    lastPollSuccessAt: null, lastPollError: null };
  let api: FeedsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(FeedsApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('reads poll health, creates feeds and sends partial changes', async () => {
    const list = api.list();
    http.expectOne({ url: path, method: 'GET' }).flush({ feeds: [feed] });
    expect(await list).toEqual([feed]);
    const create = api.create(settings);
    const post = http.expectOne({ url: path, method: 'POST' });
    expect(post.request.body).toEqual(settings);
    post.flush(feed);
    expect(await create).toEqual(feed);
    const update = api.update(1, { pollIntervalSeconds: 120, enabled: false });
    const patch = http.expectOne({ url: `${path}/1`, method: 'PATCH' });
    expect(patch.request.body).toEqual({ pollIntervalSeconds: 120, enabled: false });
    patch.flush({ ...feed, pollIntervalSeconds: 120, enabled: false });
    expect((await update).enabled).toBe(false);
  });

  it('passes a duplicate URL error to the form', async () => {
    const create = api.create(settings).catch((error: unknown) => apiError(error, 'Could not save'));
    const failure = { code: 'duplicate_feed_url', message: 'That RSS URL is already configured' };
    http.expectOne(path).flush(failure, { status: 409, statusText: 'Conflict' });
    expect(await create).toEqual(failure);
  });
});
