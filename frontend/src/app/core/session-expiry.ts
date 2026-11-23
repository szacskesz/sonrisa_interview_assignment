import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { Session } from './session';

/** Return to sign-in when a protected request loses its session. */
export const sessionExpiry: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api/') || request.url === '/api/session') return next(request);
  const session = inject(Session);
  const router = inject(Router);
  return next(request).pipe(tap({
    error: (error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && session.account()) {
        session.clear();
        void router.navigate(['/sign-in'], { queryParams: { expired: '1' }, replaceUrl: true });
      }
    },
  }));
};
