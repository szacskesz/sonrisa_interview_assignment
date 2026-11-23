import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { email, form, FormField, maxLength, required, submit } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { apiError } from '../core/api-error';
import { landingPath } from '../core/role-guard';
import { Session } from '../core/session';

@Component({
  imports: [FormField],
  selector: 'app-sign-in',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sign-in.html',
})
export class SignIn {
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap);
  private readonly model = signal({ email: '', password: '' });
  protected readonly credentials = form(this.model, (fields) => {
    required(fields.email, { message: 'Enter your email address.' });
    email(fields.email, { message: 'Enter a valid email address.' });
    maxLength(fields.email, 254);
    required(fields.password, { message: 'Enter your password.' });
    maxLength(fields.password, 128);
  });
  protected readonly failure = signal('');
  protected readonly notice = computed(() => {
    if (this.params()?.get('expired')) return 'Your session expired. Sign in again to continue.';
    if (this.params()?.get('unavailable')) return 'The session could not be checked. Try signing in again.';
    return '';
  });

  protected async signIn(event: Event): Promise<void> {
    event.preventDefault();
    this.failure.set('');
    await submit(this.credentials, async () => {
      const { email, password } = this.model();
      try {
        const account = await this.session.signIn(email.trim(), password);
        await this.router.navigateByUrl(landingPath(account.role));
      } catch (error) {
        this.failure.set(apiError(error, 'Could not sign in. Try again.').message);
      }
    });
  }
}
