import type { CoreDatabase } from '../db/database.js';
import {
  dispatchRecallSms,
  dispatchRecallWithFallback,
  type MessageDispatchResult,
} from './sms-sender.js';
import { formatTicketCode } from '../queue/ticket-code.js';

export function persistRecallNotifyResult(
  db: CoreDatabase,
  visitId: string,
  smsDispatch: MessageDispatchResult,
): void {
  if (smsDispatch.sent) {
    db.setRecallNotifyError(visitId, null);
    db.setRecallNotifySent(visitId, true);
  } else {
    db.setRecallNotifyError(visitId, smsDispatch.errorCode ?? 'UNKNOWN');
    db.setRecallNotifySent(visitId, false);
  }
}

/**
 * Visit-IDs are `YYYYMMDD-A-001`; SMS/WhatsApp must show the public ticket code `A-001`.
 * Persist paths keep using the full visitId.
 */
export function resolveRecallTicketCode(visitId: string): string {
  const match = visitId.trim().match(/^([0-9]{8})-([A-Za-z])-([0-9]{1,4})$/);
  if (!match) {
    return visitId.trim();
  }
  return formatTicketCode(match[2], Number.parseInt(match[3], 10));
}

/**
 * Dispatch recall SMS/WhatsApp and persist notify outcome on the ticket.
 *
 * Intentionally no second DB re-check while the provider call is in flight: the HTTP
 * step is short (~100–500 ms) vs a multi-minute return window. Guard instead with
 * RECALL_WINDOW_EXPIRED / MFA UI (no retry at 0:00). A scheduler race in the last
 * seconds is accepted — not treated as a bug worth outbox/extra transactions.
 */
export async function dispatchRecallNotifyAndPersist(
  db: CoreDatabase,
  visitId: string,
  input: {
    callbackPhone: string;
    returnWindowMinutes: number;
    returnUntil: string;
    checkinLocale?: string | null;
  },
  notifyChannel: 'sms' | 'whatsapp',
): Promise<MessageDispatchResult> {
  const dispatchInput = {
    ticketId: resolveRecallTicketCode(visitId),
    callbackPhone: input.callbackPhone,
    returnWindowMinutes: input.returnWindowMinutes,
    returnUntil: input.returnUntil,
    checkinLocale: input.checkinLocale ?? null,
  };
  const smsDispatch =
    notifyChannel === 'whatsapp'
      ? await dispatchRecallWithFallback(db, dispatchInput)
      : await dispatchRecallSms(db, dispatchInput);

  persistRecallNotifyResult(db, visitId, smsDispatch);

  return smsDispatch;
}
