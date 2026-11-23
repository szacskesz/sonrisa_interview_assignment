import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface SubscriptionRecord {
  id: number;
  topic: string;
  status: 'active' | 'paused';
  destination: string;
  createdAt: number;
  activatedAt: number;
}

export type SubscriptionChanges = Partial<Pick<SubscriptionRecord, 'topic' | 'status'>>;

const path = '/api/subscriptions';

/** Call the same-origin subscriptions API for the current account. */
@Service()
export class SubscriptionsApi {
  private readonly http = inject(HttpClient);

  async listTopics(): Promise<string[]> {
    const { topics } = await firstValueFrom(this.http.get<{ topics: string[] }>('/api/topics'));
    return topics;
  }

  async list(): Promise<SubscriptionRecord[]> {
    const { subscriptions } = await firstValueFrom(this.http.get<{ subscriptions: SubscriptionRecord[] }>(path));
    return subscriptions;
  }

  create(topic: string): Promise<SubscriptionRecord> {
    return firstValueFrom(this.http.post<SubscriptionRecord>(path, { topic }));
  }

  update(id: number, changes: SubscriptionChanges): Promise<SubscriptionRecord> {
    return firstValueFrom(this.http.patch<SubscriptionRecord>(`${path}/${id}`, changes));
  }

  remove(id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${path}/${id}`));
  }
}
