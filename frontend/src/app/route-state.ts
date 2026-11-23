import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { landingPath } from './core/role-guard';
import { Session } from './core/session';

@Component({
  imports: [RouterLink],
  template: `
    <section class="state-panel" aria-labelledby="route-state-title">
      <h1 id="route-state-title">Access denied</h1>
      <p>You do not have access to this page.</p>
      <a [routerLink]="home()">Return to {{ homeLabel() }}</a>
    </section>
  `,
})
export class RouteState {
  private readonly session = inject(Session);
  protected readonly home = computed(() => {
    const account = this.session.account();
    return account ? landingPath(account.role) : '/sign-in';
  });
  protected readonly homeLabel = computed(() => this.session.account() ? 'your page' : 'sign-in');
}
