import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { apiError } from '../../core/api-error';
import { refreshWhileMounted } from '../../core/page-refresh';
import { DeliveriesApi, DeliveryRecord } from '../deliveries-api';

const labels = { pending: 'Pending', sending: 'Sending', sent: 'Sent', failed: 'Failed', canceled: 'Canceled' };

@Component({
  imports: [],
  selector: 'app-deliveries-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './deliveries-page.html',
})
export class DeliveriesPage implements OnInit {
  private readonly api = inject(DeliveriesApi);
  private requesting = false;
  private loaded = false;
  protected readonly rows = signal<DeliveryRecord[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly refreshError = signal('');

  constructor() {
    refreshWhileMounted(() => void this.load(true));
  }

  ngOnInit(): void {
    void this.load();
  }

  protected async load(silent = false): Promise<void> {
    if (this.requesting) return;
    this.requesting = true;
    if (!silent) this.loading.set(true);
    try {
      this.rows.set(await this.api.list());
      this.loaded = true;
      this.loadError.set('');
      this.refreshError.set('');
    } catch (error) {
      const message = apiError(error, 'Could not load deliveries.').message;
      if (this.loaded && silent) this.refreshError.set(message);
      else this.loadError.set(message);
    } finally {
      this.requesting = false;
      this.loading.set(false);
    }
  }

  protected label(row: DeliveryRecord): string {
    return row.status === 'pending' && row.attemptCount > 0 ? 'Retrying' : labels[row.status];
  }
}
