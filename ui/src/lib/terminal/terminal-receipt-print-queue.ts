import type { TerminalReceiptPrintPayload } from './terminal-receipt-print.svelte';

export const PRINT_AFTERPRINT_TIMEOUT_MS = 10_000;

export type ReceiptPrintJob = {
  seq: number;
  payload: TerminalReceiptPrintPayload;
};

export function enqueuePrintJob(
  queue: readonly ReceiptPrintJob[],
  job: ReceiptPrintJob,
): ReceiptPrintJob[] {
  return [...queue, job];
}

export function dequeueNext(queue: readonly ReceiptPrintJob[]): {
  remaining: ReceiptPrintJob[];
  job: ReceiptPrintJob | null;
} {
  if (queue.length === 0) {
    return { remaining: [], job: null };
  }
  const [job, ...remaining] = queue;
  return { remaining, job: job ?? null };
}
