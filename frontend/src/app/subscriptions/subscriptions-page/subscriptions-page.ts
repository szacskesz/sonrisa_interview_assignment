import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, OnInit, signal, viewChild, WritableSignal } from '@angular/core';
import { form, FormField, required, submit } from '@angular/forms/signals';
import { apiError } from '../../core/api-error';
import { Session } from '../../core/session';
import { SubscriptionRecord, SubscriptionsApi } from '../subscriptions-api';

@Component({
  imports: [DatePipe, FormField],
  selector: 'app-subscriptions-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './subscriptions-page.html',
})
export class SubscriptionsPage implements OnInit {
  private readonly api = inject(SubscriptionsApi);
  private readonly editDialog = viewChild.required<ElementRef<HTMLDialogElement>>('editDialog');
  private readonly removeDialog = viewChild.required<ElementRef<HTMLDialogElement>>('removeDialog');
  protected readonly account = inject(Session).account;
  protected readonly rows = signal<SubscriptionRecord[]>([]);
  protected readonly topics = signal<string[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly feedback = signal('');
  protected readonly actionError = signal('');
  protected readonly dialogError = signal('');
  protected readonly pending = signal(false);
  protected readonly editing = signal<SubscriptionRecord | null>(null);
  protected readonly removing = signal<SubscriptionRecord | null>(null);
  protected readonly unavailableTopic = computed(() => {
    const topic = this.editing()?.topic;
    return topic && !this.topics().includes(topic) ? topic : '';
  });
  private readonly model = signal({ topic: '' });
  protected readonly editor = form(this.model, (fields) => required(fields.topic));

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      const [topics, rows] = await Promise.all([this.api.listTopics(), this.api.list()]);
      this.topics.set(topics);
      this.rows.set(rows);
    } catch (error) {
      this.loadError.set(apiError(error, 'Could not load subscriptions.').message);
    } finally {
      this.loading.set(false);
    }
  }

  protected openEditor(row: SubscriptionRecord | null = null): void {
    this.editing.set(row);
    this.dialogError.set('');
    this.editor().reset({ topic: row?.topic ?? '' });
    this.editDialog().nativeElement.showModal();
  }

  protected confirmRemove(row: SubscriptionRecord): void {
    this.removing.set(row);
    this.dialogError.set('');
    this.removeDialog().nativeElement.showModal();
  }

  protected closeDialog(dialog: HTMLDialogElement): void {
    if (!this.pending()) dialog.close();
  }

  protected keepDialogOpen(event: Event): void {
    if (this.pending()) event.preventDefault();
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.editor, () => this.mutate(async () => {
      const { topic } = this.model();
      const editing = this.editing();
      if (editing) {
        this.replace(await this.api.update(editing.id, { topic }));
      } else {
        const row = await this.api.create(topic);
        this.rows.update((rows) => [...rows, row]);
      }
      this.editDialog().nativeElement.close();
      this.feedback.set(editing ? 'Subscription updated.' : 'Subscription added.');
    }, this.dialogError, 'Could not save the subscription.'));
  }

  protected async remove(event: Event): Promise<void> {
    event.preventDefault();
    const row = this.removing();
    if (!row) return;
    await this.mutate(async () => {
      await this.api.remove(row.id);
      this.rows.update((rows) => rows.filter(({ id }) => id !== row.id));
      this.removeDialog().nativeElement.close();
      this.feedback.set('Subscription removed.');
    }, this.dialogError, 'Could not remove the subscription.');
  }

  protected async toggle(row: SubscriptionRecord): Promise<void> {
    const status = row.status === 'active' ? 'paused' : 'active';
    await this.mutate(async () => {
      this.replace(await this.api.update(row.id, { status }));
      this.feedback.set(status === 'paused' ? 'Subscription paused.' : 'Subscription resumed.');
    }, this.actionError, 'Could not change the subscription status.');
  }

  private replace(row: SubscriptionRecord): void {
    this.rows.update((rows) => rows.map((current) => current.id === row.id ? row : current));
  }

  private async mutate(update: () => Promise<void>, failure: WritableSignal<string>, fallback: string): Promise<void> {
    if (this.pending()) return;
    this.pending.set(true);
    this.feedback.set('');
    this.actionError.set('');
    failure.set('');
    try {
      await update();
    } catch (error) {
      failure.set(apiError(error, fallback).message);
    } finally {
      this.pending.set(false);
    }
  }
}
