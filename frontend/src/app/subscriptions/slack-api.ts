import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface SlackStatus {
  available: boolean;
  connection: { workspaceId: string; memberId: string } | null;
}

const path = '/api/slack';

/** Manage the current account's Slack identity through the same-origin API. */
@Service()
export class SlackApi {
  private readonly http = inject(HttpClient);

  status(): Promise<SlackStatus> {
    return firstValueFrom(this.http.get<SlackStatus>(path));
  }

  start(): Promise<{ authorizeUrl: string }> {
    return firstValueFrom(this.http.post<{ authorizeUrl: string }>(`${path}/start`, null));
  }

  confirm(): Promise<SlackStatus> {
    return firstValueFrom(this.http.post<SlackStatus>(`${path}/confirm`, null));
  }

  disconnect(): Promise<void> {
    return firstValueFrom(this.http.delete<void>(path));
  }
}
