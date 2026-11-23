import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Service, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface Account {
  id: number;
  email: string;
  role: 'user' | 'admin';
}

/** Keep the current account in memory while the browser manages the HTTP-only cookie. */
@Service()
export class Session {
  private readonly http = inject(HttpClient);
  private readonly state = signal<Account | null>(null);
  readonly account = this.state.asReadonly();

  async current(): Promise<Account | null> {
    try {
      const account = await firstValueFrom(this.http.get<Account>('/api/session'));
      this.state.set(account);
      return account;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.state.set(null);
        return null;
      }
      throw error;
    }
  }

  async signIn(email: string, password: string): Promise<Account> {
    const account = await firstValueFrom(this.http.post<Account>('/api/session', { email, password }));
    this.state.set(account);
    return account;
  }

  async signOut(): Promise<void> {
    await firstValueFrom(this.http.delete<void>('/api/session'));
    this.state.set(null);
  }
}
