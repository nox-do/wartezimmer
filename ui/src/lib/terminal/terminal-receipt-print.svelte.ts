import {
  readTerminalPrintWidthMm,
  writeTerminalPrintWidthMm,
  type TerminalPrintWidthMm,
} from './terminal-print-settings';
import { enqueuePrintJob, type ReceiptPrintJob } from './terminal-receipt-print-queue';

export type TerminalReceiptPrintKind = 'ticket' | 'test';

export type TerminalReceiptPrintPayload = {
  practiceName: string;
  ticketCode: string;
  topicLabel: string;
  destinationRoomLabel?: string | null;
  printedAtLabel: string;
  kind: TerminalReceiptPrintKind;
  /** Set for check-in bons — used to mark auto-print after spool attempt. */
  visitId?: string;
  assistance?: boolean;
};

let requestSeq = 0;

export const terminalReceiptPrint = $state<{
  printWidthMm: TerminalPrintWidthMm;
  queue: ReceiptPrintJob[];
}>({
  printWidthMm: readTerminalPrintWidthMm(),
  queue: [],
});

export function setTerminalPrintWidthMm(widthMm: TerminalPrintWidthMm): void {
  writeTerminalPrintWidthMm(widthMm);
  terminalReceiptPrint.printWidthMm = widthMm;
}

export function requestTerminalReceiptPrint(payload: TerminalReceiptPrintPayload): void {
  requestSeq += 1;
  terminalReceiptPrint.queue = enqueuePrintJob(terminalReceiptPrint.queue, {
    seq: requestSeq,
    payload,
  });
}
