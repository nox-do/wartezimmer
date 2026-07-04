import type { CoreDatabase } from '../db/database.js';
import {
  dispatchRecallSms,
  dispatchRecallWithFallback,
  type MessageDispatchResult,
} from './sms-sender.js';

export function persistRecallNotifyResult(
  db: CoreDatabase,
  ticketId: string,
  smsDispatch: MessageDispatchResult,
): void {
  if (smsDispatch.sent) {
    db.setRecallNotifyError(ticketId, null);
    db.setRecallNotifySent(ticketId, true);
  } else {
    db.setRecallNotifyError(ticketId, smsDispatch.errorCode ?? 'UNKNOWN');
    db.setRecallNotifySent(ticketId, false);
  }
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
  ticketId: string,
  input: {
    callbackPhone: string;
    returnWindowMinutes: number;
    returnUntil: string;
    checkinLocale?: string | null;
  },
  notifyChannel: 'sms' | 'whatsapp',
): Promise<MessageDispatchResult> {
  const dispatchInput = {
    ticketId,
    callbackPhone: input.callbackPhone,
    returnWindowMinutes: input.returnWindowMinutes,
    returnUntil: input.returnUntil,
    checkinLocale: input.checkinLocale ?? null,
  };
  const smsDispatch =
    notifyChannel === 'whatsapp'
      ? await dispatchRecallWithFallback(db, dispatchInput)
      : await dispatchRecallSms(db, dispatchInput);

  persistRecallNotifyResult(db, ticketId, smsDispatch);

  return smsDispatch;
}
