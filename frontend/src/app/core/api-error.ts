import { HttpErrorResponse } from '@angular/common/http';

/** Read a public API validation error and fall back for network and proxy failures. */
export function apiError(error: unknown, fallback: string): { code: string; message: string } {
  if (error instanceof HttpErrorResponse) {
    const body: unknown = error.error;
    if (body && typeof body === 'object' && 'code' in body && typeof body.code === 'string' &&
        'message' in body && typeof body.message === 'string') {
      return { code: body.code, message: body.message };
    }
  }
  return { code: 'request_failed', message: fallback };
}
