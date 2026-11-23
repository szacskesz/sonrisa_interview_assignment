import { DestroyRef, inject } from '@angular/core';

/** Refresh changing admin data while its page is mounted. */
export function refreshWhileMounted(refresh: () => void): void {
  const timer = globalThis.setInterval(refresh, 5_000);
  inject(DestroyRef).onDestroy(() => globalThis.clearInterval(timer));
}
