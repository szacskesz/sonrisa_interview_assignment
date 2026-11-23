import { TestBed } from '@angular/core/testing';
import { settle } from '../../testing/dom';
import { DeliveriesApi, DeliveryRecord } from '../deliveries-api';
import { DeliveriesPage } from './deliveries-page';

const row: DeliveryRecord = { id: 1, title: 'Headline', publisher: 'Demo RSS', channel: 'slack',
  status: 'pending', attemptCount: 2, lastError: 'Temporary failure' };

function setup(list: () => Promise<DeliveryRecord[]>) {
  TestBed.configureTestingModule({ imports: [DeliveriesPage], providers: [{ provide: DeliveriesApi, useValue: { list } }] });
  const fixture = TestBed.createComponent(DeliveriesPage);
  const root: HTMLElement = fixture.nativeElement;
  return { root, stable: () => settle(fixture) };
}

describe('Deliveries page', () => {
  it('shows the job title, source, channel, status, attempts and latest error', async () => {
    const { root, stable } = setup(async () => [row, { ...row, id: 2, status: 'sent', lastError: null }]);
    await stable();
    const rows = [...root.querySelectorAll<HTMLTableRowElement>('tbody tr')];
    expect([...rows[0].cells].map((cell) => cell.textContent)).toEqual([
      'Headline', 'Demo RSS', 'Slack DM', 'Retrying', '2', 'Temporary failure',
    ]);
    expect(rows[1].cells[3].textContent).toBe('Sent');
  });

  it('shows load errors and lets an administrator retry into the empty state', async () => {
    const list = vi.fn<() => Promise<DeliveryRecord[]>>().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue([]);
    const { root, stable } = setup(list);
    await stable();
    expect(root.textContent).toContain('Deliveries unavailable');
    root.querySelector('button')!.click();
    await stable();
    expect(root.textContent).toContain('No deliveries yet');
  });
});
