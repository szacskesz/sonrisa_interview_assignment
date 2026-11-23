import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { apiError } from '../core/api-error';
import { DeliveriesApi, DeliveryRecord } from './deliveries-api';

describe('DeliveriesApi', () => {
  let api: DeliveriesApi;
  let http: HttpTestingController;
  const path = '/api/admin/deliveries';

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(DeliveriesApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('loads recent outcomes and preserves attempt details', async () => {
    const delivery: DeliveryRecord = { id: 4, title: 'Headline', publisher: 'Demo', status: 'failed',
      attemptCount: 2, lastError: 'Rejected' };
    const list = api.list();
    http.expectOne({ method: 'GET', url: path }).flush({ deliveries: [delivery] });
    expect(await list).toEqual([delivery]);
  });

  it('passes access and network failures to the caller', async () => {
    const list = api.list().catch((error: unknown) => apiError(error, 'Could not load deliveries'));
    http.expectOne(path).flush({ code: 'forbidden', message: 'Administrator access is required' },
      { status: 403, statusText: 'Forbidden' });
    expect(await list).toMatchObject({ code: 'forbidden' });
    const unavailable = api.list().catch((error: unknown) => apiError(error, 'Could not load deliveries'));
    http.expectOne(path).error(new ProgressEvent('error'));
    expect(await unavailable).toMatchObject({ message: 'Could not load deliveries' });
  });
});
