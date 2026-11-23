import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type SourceKind = 'rss' | 'usgs';

export interface FeedSettings {
  url: string;
  publisher: string;
  topic: string;
  enabled: boolean;
  pollIntervalSeconds: number;
}

export type NewSource = (FeedSettings & { sourceKind?: 'rss' })
  | (Pick<FeedSettings, 'enabled' | 'pollIntervalSeconds'> & { sourceKind: 'usgs' });

export interface FeedRecord extends FeedSettings {
  id: number;
  sourceKind: SourceKind;
  nextPollAt: number;
  lastPollAttemptAt: number | null;
  lastPollSuccessAt: number | null;
  lastPollError: string | null;
}

const path = '/api/admin/feeds';

/** Read poll health and manage admin-configured event sources. */
@Service()
export class FeedsApi {
  private readonly http = inject(HttpClient);

  async list(): Promise<FeedRecord[]> {
    const { feeds } = await firstValueFrom(this.http.get<{ feeds: FeedRecord[] }>(path));
    return feeds;
  }

  create(settings: NewSource): Promise<FeedRecord> {
    return firstValueFrom(this.http.post<FeedRecord>(path, settings));
  }

  update(id: number, changes: Partial<FeedSettings>): Promise<FeedRecord> {
    return firstValueFrom(this.http.patch<FeedRecord>(`${path}/${id}`, changes));
  }
}
