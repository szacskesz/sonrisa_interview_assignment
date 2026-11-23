import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type DeliveryStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'canceled';

export interface DeliveryRecord {
  id: number;
  title: string;
  publisher: string;
  status: DeliveryStatus;
  attemptCount: number;
  lastError: string | null;
}

/** Read the delivery summaries visible to an administrator. */
@Service()
export class DeliveriesApi {
  private readonly http = inject(HttpClient);

  async list(): Promise<DeliveryRecord[]> {
    const { deliveries } = await firstValueFrom(this.http.get<{ deliveries: DeliveryRecord[] }>('/api/admin/deliveries'));
    return deliveries;
  }
}
