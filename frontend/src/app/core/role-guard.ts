import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Account, Session } from './session';

export function landingPath(role: Account['role']): string {
  return role === 'admin' ? '/admin/feeds' : '/subscriptions';
}

/** Restore the current session before opening a route for a given role. */
export function requireRole(role: Account['role']): CanActivateFn {
  return async () => {
    const session = inject(Session);
    const router = inject(Router);
    try {
      const account = await session.current();
      if (!account) return router.parseUrl('/sign-in');
      return account.role === role || router.parseUrl('/access-denied');
    } catch {
      return router.createUrlTree(['/sign-in'], { queryParams: { unavailable: '1' } });
    }
  };
}

export const signInGuard: CanActivateFn = async () => {
  const session = inject(Session);
  const router = inject(Router);
  try {
    const account = await session.current();
    return account ? router.parseUrl(landingPath(account.role)) : true;
  } catch {
    session.clear();
    return true;
  }
};
