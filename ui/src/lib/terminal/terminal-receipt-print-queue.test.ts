import { describe, expect, it } from 'vitest';
import { dequeueNext, enqueuePrintJob, type ReceiptPrintJob } from './terminal-receipt-print-queue';

function job(seq: number, ticketCode: string): ReceiptPrintJob {
  return {
    seq,
    payload: {
      practiceName: 'Test',
      ticketCode,
      topicLabel: 'Termin',
      printedAtLabel: '01.01.2026 10:00',
      kind: 'ticket',
      ticketId: `ticket-${seq}`,
    },
  };
}

describe('terminal receipt print queue', () => {
  it('enqueuePrintJob appends FIFO', () => {
    const q1 = enqueuePrintJob([], job(1, 'A-001'));
    const q2 = enqueuePrintJob(q1, job(2, 'A-002'));
    expect(q2).toHaveLength(2);
    expect(q2[0]?.payload.ticketCode).toBe('A-001');
    expect(q2[1]?.payload.ticketCode).toBe('A-002');
  });

  it('dequeueNext returns first job and shortens queue', () => {
    const queue = enqueuePrintJob([], job(1, 'A-001'));
    const second = enqueuePrintJob(queue, job(2, 'A-002'));
    const first = dequeueNext(second);
    expect(first.job?.payload.ticketCode).toBe('A-001');
    expect(first.remaining).toHaveLength(1);
    expect(first.remaining[0]?.payload.ticketCode).toBe('A-002');
  });

  it('dequeueNext on empty queue returns null', () => {
    const result = dequeueNext([]);
    expect(result.job).toBeNull();
    expect(result.remaining).toEqual([]);
  });
});
