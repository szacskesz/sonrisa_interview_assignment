import { ComponentFixture } from '@angular/core/testing';

/** Let resolved mock requests update the DOM before an assertion. */
export async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await fixture.whenStable();
}

/** JSDOM lacks modal methods. Playwright covers native dialog behavior. */
export function stubDialogs(root: HTMLElement): void {
  for (const dialog of root.querySelectorAll('dialog')) {
    dialog.showModal = () => { dialog.open = true; };
    dialog.close = () => { dialog.open = false; };
  }
}
