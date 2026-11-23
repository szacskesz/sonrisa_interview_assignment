import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { apiError } from '../core/api-error';
import { SubscriptionRecord, SubscriptionsApi } from './subscriptions-api';

describe('SubscriptionsApi', () => {
  const path = '/api/subscriptions';
  const row: SubscriptionRecord = {
    id: 7, status: 'active', topic: 'World', channels: ['email', 'slack'],
    destination: 'reader@example.test', createdAt: 1, activatedAt: 1,
  };
  let api: SubscriptionsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(SubscriptionsApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('lists enabled topics and owned subscriptions', async () => {
    const topics = api.listTopics();
    http.expectOne({ method: 'GET', url: '/api/topics' }).flush({ topics: ['World'] });
    expect(await topics).toEqual(['World']);
    const list = api.list();
    http.expectOne({ method: 'GET', url: path }).flush({ subscriptions: [row] });
    expect(await list).toEqual([row]);
  });

  it('creates, updates and removes a subscription by sending only supported fields', async () => {
    const create = api.create('World', ['email', 'slack']);
    const post = http.expectOne({ method: 'POST', url: path });
    expect(post.request.body).toEqual({ topic: 'World', channels: ['email', 'slack'] });
    post.flush(row);
    expect(await create).toEqual(row);

    const update = api.update(7, { status: 'paused' });
    const patch = http.expectOne({ method: 'PATCH', url: `${path}/7` });
    expect(patch.request.body).toEqual({ status: 'paused' });
    patch.flush({ ...row, status: 'paused' });
    expect((await update).status).toBe('paused');

    const remove = api.remove(7);
    http.expectOne({ method: 'DELETE', url: `${path}/7` }).flush(null, { status: 204, statusText: 'No Content' });
    await remove;
  });

  it('exposes validation codes and uses a fallback for unknown failures', async () => {
    const create = api.create('Missing').catch((error: unknown) => apiError(error, 'Could not create'));
    const validation = { code: 'topic_unavailable', message: 'Choose an available topic' };
    http.expectOne(path).flush(validation, { status: 400, statusText: 'Bad Request' });
    expect(await create).toEqual(validation);
    expect(apiError('Unavailable', 'Could not create')).toEqual({ code: 'request_failed', message: 'Could not create' });
  });
});
