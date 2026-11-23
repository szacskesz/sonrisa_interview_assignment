import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { apiError } from './core/api-error';
import { Session } from './core/session';

@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
})
export class App {
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  protected readonly account = this.session.account;
  protected readonly signingOut = signal(false);
  protected readonly failure = signal('');

  protected async signOut(): Promise<void> {
    this.signingOut.set(true);
    this.failure.set('');
    try {
      await this.session.signOut();
      await this.router.navigateByUrl('/sign-in', { replaceUrl: true });
    } catch (error) {
      this.failure.set(apiError(error, 'Could not sign out. Try again.').message);
    } finally {
      this.signingOut.set(false);
    }
  }
}
