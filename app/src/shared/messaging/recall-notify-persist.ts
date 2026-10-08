import { publishTvQueueUpdate } from '../queue/queue-stream-hub.js';
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
  token: string,
): void {
  db.finishRecallDelivery(visitId, token, smsDispatch);
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
 * One persisted state per recall window prevents concurrent retries. An interrupted
 * send is recovered as unknown, never automatically resent.
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
  notifyChannel: 'sms' | 'whatsapp' = 'whatsapp',
): Promise<MessageDispatchResult> {
  if (!db.hasRecallNotifyConsent(visitId, input.callbackPhone)) {
    const result: MessageDispatchResult = {
      provider: 'none',
      attempted: false,
      sent: false,
      errorCode: 'RECALL_CONSENT_REQUIRED',
    };
    return result;
  }
  const previous = db.listRecallDeliveries().find((row) => row.visitId === visitId);
  const token = db.beginRecallDelivery(visitId, input.returnUntil, input.callbackPhone);
  if (!token) {
    return {
      provider: 'none',
      attempted: false,
      sent: false,
      status: 'unknown',
      errorCode: 'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
    };
  }
  publishTvQueueUpdate(db);
  const dispatchInput = {
    ticketId: resolveRecallTicketCode(visitId),
    callbackPhone: input.callbackPhone,
    returnWindowMinutes: input.returnWindowMinutes,
    returnUntil: input.returnUntil,
    checkinLocale: input.checkinLocale ?? null,
  };
  // A failed SMS (including fallback) should not restart WhatsApp on manual retry.
  const retrySms =
    previous?.returnUntil === input.returnUntil &&
    previous.phone === input.callbackPhone &&
    previous.provider === 'seven';
  const smsDispatch =
    notifyChannel === 'whatsapp' && !retrySms
      ? await dispatchRecallWithFallback(db, dispatchInput, () => {
          const current = db.listQueue().find((item) => item.id === visitId);
          return (
            current?.status === 'absent_return_later' &&
            current.returnUntil === input.returnUntil &&
            (current.callbackPhone || current.checkinPhone) === input.callbackPhone &&
            db.hasRecallNotifyConsent(visitId, input.callbackPhone)
          );
        })
      : await dispatchRecallSms(db, dispatchInput);

  persistRecallNotifyResult(db, visitId, smsDispatch, token);

  return smsDispatch;
}
