import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { requireRole, signInGuard } from '../core/role-guard';
import { Account, Session } from '../core/session';
import { RouteState } from '../route-state';
import { SignIn } from './sign-in';

@Component({ template: 'Signed in' })
class Landing {}

describe('Sign-in and role routing', () => {
  const user: Account = { id: 1, email: 'user@example.test', role: 'user' };
  const account = signal<Account | null>(null);
  const current = vi.fn(async () => account());
  const signIn = vi.fn(async () => {
    account.set(user);
    return user;
  });

  beforeEach(() => {
    account.set(null);
    current.mockClear();
    signIn.mockClear();
    TestBed.configureTestingModule({ providers: [
      { provide: Session, useValue: { account, current, signIn, clear: () => account.set(null) } },
      provideRouter([
        { path: 'sign-in', canActivate: [signInGuard], component: SignIn },
        { path: 'subscriptions', canActivate: [requireRole('user')], component: Landing },
        { path: 'admin/feeds', canActivate: [requireRole('admin')], component: Landing },
        { path: 'access-denied', title: 'Access denied', component: RouteState },
      ]),
    ] });
  });

  it('requires sign-in and displays access denied for a different role', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/subscriptions', SignIn);
    expect(TestBed.inject(Router).url).toBe('/sign-in');
    account.set(user);
    await harness.navigateByUrl('/admin/feeds', RouteState);
    expect(harness.routeNativeElement?.textContent).toContain('You do not have access');
  });

  it('redirects an existing admin session to its landing page', async () => {
    account.set({ ...user, role: 'admin' });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/sign-in', Landing);
    expect(TestBed.inject(Router).url).toBe('/admin/feeds');
  });

  it('validates sign-in and routes a successful login to subscriptions', async () => {
    const harness = await RouterTestingHarness.create('/sign-in?expired=1');
    const root = harness.routeNativeElement!;
    expect(root.textContent).toContain('Your session expired');
    const form = root.querySelector('form')!;
    const submit = () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    submit();
    await harness.fixture.whenStable();
    expect(signIn).not.toHaveBeenCalled();
    const email = root.querySelector<HTMLInputElement>('input[type="email"]')!;
    const password = root.querySelector<HTMLInputElement>('input[type="password"]')!;
    email.value = user.email;
    email.dispatchEvent(new Event('input'));
    password.value = 'test-password';
    password.dispatchEvent(new Event('input'));
    submit();
    await harness.fixture.whenStable();
    expect(signIn).toHaveBeenCalledWith(user.email, 'test-password');
    expect(TestBed.inject(Router).url).toBe('/subscriptions');
  });
});
