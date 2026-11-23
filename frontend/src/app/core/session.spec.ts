import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Account, Session } from './session';

describe('Session', () => {
  const account: Account = { id: 1, email: 'user@example.test', role: 'user' };
  let session: Session;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    session = TestBed.inject(Session);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('signs in, restores the account, and signs out without handling a token', async () => {
    const signIn = session.signIn(account.email, 'example-password');
    const login = http.expectOne({ url: '/api/session', method: 'POST' });
    expect(login.request.body).toEqual({ email: account.email, password: 'example-password' });
    login.flush(account);
    expect(await signIn).toEqual(account);
    expect(session.account()).toEqual(account);

    const current = session.current();
    const updated = { ...account, role: 'admin' };
    http.expectOne({ url: '/api/session', method: 'GET' }).flush(updated);
    expect(await current).toEqual(updated);

    const signOut = session.signOut();
    http.expectOne({ url: '/api/session', method: 'DELETE' }).flush(null, { status: 204, statusText: 'No Content' });
    await signOut;
    expect(session.account()).toBeNull();
  });

  it('clears an expired session and distinguishes other request failures', async () => {
    const current = session.current();
    http.expectOne('/api/session').flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(await current).toBeNull();

    const unavailable = session.current();
    http.expectOne('/api/session').flush(null, { status: 503, statusText: 'Unavailable' });
    await expect(unavailable).rejects.toBeInstanceOf(HttpErrorResponse);
  });
});
