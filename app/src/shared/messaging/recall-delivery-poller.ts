import type { CoreDatabase } from '../db/database.js';
import { isRecord } from '../type-guards.js';
import { resolveSevenApiKey } from './sms-sender.js';
import { dispatchRecallNotifyAndPersist } from './recall-notify-persist.js';
import { publishTvQueueUpdate } from '../queue/queue-stream-hub.js';

export function parseDeliveryStatus(
  payload: unknown,
  messageId: string,
): 'delivered' | 'failed' | null {
  if (!Array.isArray(payload)) return null;
  const row = payload.find((entry) => isRecord(entry) && String(entry.id) === messageId);
  if (!isRecord(row) || typeof row.dlr !== 'string') return null;
  const status = row.dlr.toUpperCase();
  if (status === 'DELIVERED' || status === 'READ') return 'delivered';
  if (['NOTDELIVERED', 'FAILED', 'REJECTED', 'EXPIRED'].includes(status)) return 'failed';
  return null;
}

/** Only current recalls are queried. Missing reports and query failures never trigger a send. */
export async function pollRecallDeliveries(db: CoreDatabase, stopped = () => false): Promise<void> {
  for (const delivery of db.listRecallDeliveries()) {
    if (stopped()) return;
    if (
      delivery.status !== 'accepted' ||
      !delivery.messageId ||
      Date.parse(delivery.returnUntil) <= Date.now()
    )
      continue;
    if (delivery.provider !== 'seven' && delivery.provider !== 'seven_whatsapp') continue;
    const apiKey = resolveSevenApiKey(db, delivery.provider);
    if (!apiKey) continue;
    let status: 'delivered' | 'failed' | null;
    try {
      const response = await fetch(
        `https://gateway.seven.io/api/journal/outbound?id=${encodeURIComponent(delivery.messageId)}`,
        {
          headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (!response.ok) continue;
      status = parseDeliveryStatus(await response.json(), delivery.messageId);
    } catch {
      continue;
    }
    if (stopped() || !status) continue;
    const changed = db.finishRecallDelivery(
      delivery.visitId,
      delivery.token,
      {
        provider: delivery.provider,
        messageId: delivery.messageId,
        attempted: true,
        sent: status === 'delivered',
        errorCode: status === 'failed' ? 'DELIVERY_FAILED' : undefined,
      },
      status,
    );
    if (!changed) continue;
    if (status === 'failed' && delivery.provider === 'seven_whatsapp') {
      const current = db.listQueue().find((item) => item.id === delivery.visitId);
      if (
        current?.status === 'absent_return_later' &&
        current.returnUntil === delivery.returnUntil &&
        Date.parse(delivery.returnUntil) > Date.now() &&
        (current.callbackPhone || current.checkinPhone) === delivery.phone &&
        db.hasRecallNotifyConsent(delivery.visitId, delivery.phone)
      ) {
        await dispatchRecallNotifyAndPersist(
          db,
          delivery.visitId,
          {
            callbackPhone: delivery.phone,
            returnUntil: delivery.returnUntil,
            returnWindowMinutes: Math.max(
              1,
              Math.ceil((Date.parse(delivery.returnUntil) - Date.now()) / 60_000),
            ),
            checkinLocale: db.retryRecallNotify(delivery.visitId).checkinLocale,
          },
          'sms',
        );
      }
    }
    publishTvQueueUpdate(db);
  }
}

export function startRecallDeliveryPolling(db: CoreDatabase): () => Promise<void> {
  db.recoverRecallDeliveries();
  let stopped = false;
  let running: Promise<void> | null = null;
  const tick = () => {
    if (running || stopped) return;
    running = pollRecallDeliveries(db, () => stopped)
      .catch(() => {
        // Keep the last known status on transient DB/reset failures; the next tick retries reads.
      })
      .finally(() => {
        running = null;
      });
  };
  const timer = setInterval(tick, 15_000);
  timer.unref();
  tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await running;
  };
}
