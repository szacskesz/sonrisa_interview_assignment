import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { applyWhen, FormField, form, maxLength, min, pattern, required, submit, validate } from '@angular/forms/signals';
import { apiError } from '../../core/api-error';
import { refreshWhileMounted } from '../../core/page-refresh';
import { FeedRecord, FeedsApi, FeedSettings, SourceKind } from '../feeds-api';

const defaultIntervals = { rss: 300, usgs: 60 };
const defaultSettings: FeedSettings & { sourceKind: SourceKind } = {
  sourceKind: 'rss', url: '', publisher: '', topic: '', enabled: true, pollIntervalSeconds: defaultIntervals.rss,
};

@Component({
  imports: [DatePipe, FormField],
  selector: 'app-feeds-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './feeds-page.html',
})
export class FeedsPage implements OnInit {
  private readonly api = inject(FeedsApi);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('feedDialog');
  private readonly model = signal({ ...defaultSettings });
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
  protected readonly sourceKind = computed(() => this.model().sourceKind);
  protected readonly editor = form(this.model, (fields) => {
    applyWhen(fields, ({ value }) => value().sourceKind === 'rss', (rss) => {
      required(rss.url);
      pattern(rss.url, /^https?:\/\/\S+$/i);
      maxLength(rss.url, 2_048);
      required(rss.publisher);
      maxLength(rss.publisher, 120);
      required(rss.topic);
      maxLength(rss.topic, 120);
    });
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
      const message = apiError(error, 'Could not load sources.').message;
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
      const { sourceKind, url, topic, publisher, enabled, pollIntervalSeconds } = feed;
      this.editor().reset({ sourceKind, url, topic, publisher, enabled, pollIntervalSeconds });
    }
    this.dialog().nativeElement.showModal();
  }

  protected changeSourceKind(): void {
    this.editor.pollIntervalSeconds().value.set(defaultIntervals[this.sourceKind()]);
    this.dialogError.set(null);
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
      const { sourceKind, url, publisher, topic, ...rest } = this.model();
      const settings = { ...rest, url: url.trim(), publisher: publisher.trim(), topic: topic.trim() };
      if (sourceKind === 'rss' && (!settings.publisher || !settings.topic)) {
        this.dialogError.set({ code: 'invalid_feed_settings', message: 'Enter a publisher and topic.' });
        return;
      }
      try {
        const update = sourceKind === 'usgs'
          ? () => id === null ? this.api.create({ sourceKind, ...rest }) : this.api.update(id, rest)
          : () => id === null ? this.api.create(settings) : this.api.update(id, settings);
        await this.mutate(update, id === null ? 'Source added.' : 'Source updated.');
        this.dialog().nativeElement.close();
      } catch (error) {
        this.dialogError.set(apiError(error, 'Could not save the source.'));
      }
    });
  }

  protected async toggle(feed: FeedRecord): Promise<void> {
    const enabled = !feed.enabled;
    try {
      await this.mutate(() => this.api.update(feed.id, { enabled }), enabled ? 'Source enabled.' : 'Source disabled.');
    } catch (error) {
      this.actionError.set(apiError(error, 'Could not change the source status.').message);
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
