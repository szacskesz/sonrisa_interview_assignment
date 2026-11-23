import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormField, form, maxLength, min, pattern, required, submit, validate } from '@angular/forms/signals';
import { apiError } from '../../core/api-error';
import { refreshWhileMounted } from '../../core/page-refresh';
import { FeedRecord, FeedsApi, FeedSettings } from '../feeds-api';

const defaultSettings: FeedSettings = { url: '', publisher: '', topic: '', enabled: true, pollIntervalSeconds: 300 };

@Component({
  imports: [DatePipe, FormField],
  selector: 'app-feeds-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './feeds-page.html',
})
export class FeedsPage implements OnInit {
  private readonly api = inject(FeedsApi);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('feedDialog');
  private readonly model = signal<FeedSettings>({ ...defaultSettings });
  private requesting = false;
  private revision = 0;
  protected readonly rows = signal<FeedRecord[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly refreshError = signal('');
  protected readonly feedback = signal('');
  protected readonly actionError = signal('');
  protected readonly dialogError = signal<{ code: string; message: string } | null>(null);
  protected readonly pending = signal(false);
  protected readonly editing = signal<number | null>(null);
  protected readonly editor = form(this.model, (fields) => {
    required(fields.url);
    pattern(fields.url, /^https?:\/\/\S+$/i);
    maxLength(fields.url, 2_048);
    required(fields.publisher);
    maxLength(fields.publisher, 120);
    required(fields.topic);
    maxLength(fields.topic, 120);
    required(fields.pollIntervalSeconds);
    min(fields.pollIntervalSeconds, 1);
    validate(fields.pollIntervalSeconds, ({ value }) => Number.isSafeInteger(value()) ? null : { kind: 'integer' });
  });

  constructor() {
    refreshWhileMounted(() => void this.load(true));
  }

  ngOnInit(): void {
    void this.load();
  }

  protected async load(silent = false): Promise<void> {
    if (this.requesting || this.pending()) return;
    this.requesting = true;
    const revision = this.revision;
    if (!silent) this.loading.set(true);
    try {
      const rows = await this.api.list();
      if (revision === this.revision) this.rows.set(rows);
      this.loadError.set('');
      this.refreshError.set('');
    } catch (error) {
      const message = apiError(error, 'Could not load RSS feeds.').message;
      if (silent && !this.loadError()) this.refreshError.set(message);
      else this.loadError.set(message);
    } finally {
      this.requesting = false;
      this.loading.set(false);
    }
  }

  protected health(feed: FeedRecord): string {
    if (!feed.enabled) return 'Disabled';
    if (feed.lastPollError) return 'Poll failed';
    return feed.lastPollSuccessAt === null ? 'Waiting' : 'Healthy';
  }

  protected openEditor(feed?: FeedRecord): void {
    this.editing.set(feed?.id ?? null);
    this.dialogError.set(null);
    if (!feed) {
      this.editor().reset({ ...defaultSettings });
    } else {
      const { url, topic, publisher, enabled, pollIntervalSeconds } = feed;
      this.editor().reset({ url, topic, publisher, enabled, pollIntervalSeconds });
    }
    this.dialog().nativeElement.showModal();
  }

  protected cancel(event?: Event): void {
    if (this.pending()) {
      event?.preventDefault();
    } else if (!event) {
      this.dialog().nativeElement.close();
    }
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    this.dialogError.set(null);
    await submit(this.editor, async () => {
      const id = this.editing();
      const { url, publisher, topic, ...rest } = this.model();
      const settings = { ...rest, url: url.trim(), publisher: publisher.trim(), topic: topic.trim() };
      if (!settings.publisher || !settings.topic) {
        this.dialogError.set({ code: 'invalid_feed_settings', message: 'Enter a publisher and topic.' });
        return;
      }
      try {
        await this.mutate(
          () => id === null ? this.api.create(settings) : this.api.update(id, settings),
          id === null ? 'Feed added.' : 'Feed updated.',
        );
        this.dialog().nativeElement.close();
      } catch (error) {
        this.dialogError.set(apiError(error, 'Could not save the feed.'));
      }
    });
  }

  protected async toggle(feed: FeedRecord): Promise<void> {
    const enabled = !feed.enabled;
    try {
      await this.mutate(() => this.api.update(feed.id, { enabled }), enabled ? 'Feed enabled.' : 'Feed disabled.');
    } catch (error) {
      this.actionError.set(apiError(error, 'Could not change the feed status.').message);
    }
  }

  private async mutate(update: () => Promise<FeedRecord>, message: string): Promise<void> {
    this.pending.set(true);
    this.revision += 1;
    this.feedback.set('');
    this.actionError.set('');
    try {
      const feed = await update();
      this.rows.update((rows) => rows.some(({ id }) => id === feed.id)
        ? rows.map((row) => row.id === feed.id ? feed : row)
        : [...rows, feed]);
      this.feedback.set(message);
    } finally {
      this.pending.set(false);
    }
  }
}
