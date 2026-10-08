import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { CoreDatabase } from '../db/database.js';
import { dispatchRecallNotifyAndPersist } from './recall-notify-persist.js';
import { parseDeliveryStatus, pollRecallDeliveries } from './recall-delivery-poller.js';
import { resetRecallWindowExpirySchedulerForTests } from '../queue/recall-window-expiry-scheduler.js';

function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'pf-recall-'));
  const previousEnv = process.env.NODE_ENV;
  const previousImports = process.env.CONTACT_LOOKUP_BASE_PATH;
  const previousFetch = globalThis.fetch;
  process.env.NODE_ENV = 'test';
  process.env.CONTACT_LOOKUP_BASE_PATH = join(directory, 'imports');
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
    if (previousImports === undefined) delete process.env.CONTACT_LOOKUP_BASE_PATH;
    else process.env.CONTACT_LOOKUP_BASE_PATH = previousImports;
    resetRecallWindowExpirySchedulerForTests();
    rmSync(directory, { recursive: true, force: true });
  });
  const db = new CoreDatabase(join(directory, 'test.db'));
  const state = db.getDayLifecycleState();
  if (state.needsDayStartHint || state.checkinLocked) db.resetBusinessDay();
  if (db.getOpsState().checkinLocked) db.setCheckinLock(false);
  db.updateOpsSettings({ smsProvider: 'seven' });
  db.updateMessagingProviderConfig('seven', { enabled: true, credentials: { apiKey: 'test' } });
  db.updateMessagingProviderConfig('seven_whatsapp', {
    enabled: true,
    credentials: { apiKey: 'test', from: '491511111111', template: 'recall', language: 'de' },
  });
  const visitId = db.createTicket({
    topicId: 'blut',
    authPath: 'none',
    needsAssistance: true,
  }).visitId;
  db.setAbsence(visitId, 'wait_here', {
    callbackPhone: '+4917612345678',
    recallConsentConfirmed: true,
  });
  const recall = db.recallVisit(visitId, 15);
  const input = { ...recall, callbackPhone: recall.callbackPhone! };
  return { db, visitId, input };
}

const accepted = (id: string) =>
  Response.json({ success: '100', messages: [{ success: true, id }] });

for (const change of ['return', 'clear-phone'] as const) {
  test(`immediate fallback stops after ${change} during WhatsApp request`, async (t) => {
    const { db, visitId, input } = fixture(t);
    let smsCalls = 0;
    globalThis.fetch = (async (url) => {
      if (String(url).includes('/waba/')) {
        if (change === 'return') db.returnToWaiting(visitId);
        else db.clearCallbackPhone(visitId);
        return Response.json({ success: '400' });
      }
      smsCalls++;
      return accepted('sms-1');
    }) as typeof fetch;
    await dispatchRecallNotifyAndPersist(db, visitId, input);
    assert.equal(smsCalls, 0);
  });
}

test('automatic WhatsApp, later failure, one SMS fallback, then delivered', async (t) => {
  const { db, visitId, input } = fixture(t);
  const calls: string[] = [];
  globalThis.fetch = (async (url, init) => {
    const path = String(url);
    calls.push(path);
    if (path.includes('/waba/')) {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.to, '4917612345678');
      assert.ok(body.ttl > 0 && body.ttl <= 15);
      return accepted('wa-1');
    }
    if (path.includes('/api/sms')) return accepted('sms-1');
    return Response.json([
      {
        id: path.includes('wa-1') ? 'wa-1' : 'sms-1',
        dlr: path.includes('wa-1') ? 'NOTDELIVERED' : 'DELIVERED',
      },
    ]);
  }) as typeof fetch;
  const result = await dispatchRecallNotifyAndPersist(db, visitId, input);
  assert.equal(result.provider, 'seven_whatsapp');
  assert.equal(db.listQueue()[0].recallNotifyStatus, 'accepted');
  await pollRecallDeliveries(db);
  assert.equal(db.listRecallDeliveries()[0].provider, 'seven');
  await pollRecallDeliveries(db);
  await pollRecallDeliveries(db);
  assert.equal(db.listQueue()[0].recallNotifyStatus, 'delivered');
  assert.equal(calls.filter((url) => url.includes('/api/sms')).length, 1);
});

test('timeout is unknown and blocks fallback and manual retry', async (t) => {
  const { db, visitId, input } = fixture(t);
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    throw new DOMException('timed out', 'TimeoutError');
  }) as typeof fetch;
  const result = await dispatchRecallNotifyAndPersist(db, visitId, input);
  assert.equal(result.status, 'unknown');
  assert.equal(db.listQueue()[0].recallNotifyStatus, 'unknown');
  assert.throws(() => db.retryRecallNotify(visitId), /RECALL_NOTIFY_RETRY_NOT_ALLOWED/);
  await pollRecallDeliveries(db);
  assert.equal(calls, 1);
});

for (const response of ['server-error', 'invalid-json'] as const) {
  test(`${response} does not trigger a second message`, async (t) => {
    const { db, visitId, input } = fixture(t);
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response('unreadable response', {
        status: response === 'server-error' ? 503 : 200,
      });
    }) as typeof fetch;
    const result = await dispatchRecallNotifyAndPersist(db, visitId, input);
    assert.equal(result.status, 'unknown');
    assert.equal(calls, 1);
  });
}

test('overlapping sends claim the recall once; interrupted sends recover as unknown', async (t) => {
  const { db, visitId, input } = fixture(t);
  let release!: (value: Response) => void;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Promise<Response>((resolve) => {
      release = resolve;
    });
  }) as typeof fetch;
  const first = dispatchRecallNotifyAndPersist(db, visitId, input);
  const second = await dispatchRecallNotifyAndPersist(db, visitId, input);
  assert.equal(second.attempted, false);
  assert.equal(calls, 1);
  assert.equal(db.listQueue()[0].recallNotifyStatus, 'sending');
  release(accepted('wa-1'));
  await first;
  // Another active recall with an interrupted send.
  db.returnToWaiting(visitId);
  db.setAbsence(visitId, 'wait_here', {
    callbackPhone: input.callbackPhone,
    recallConsentConfirmed: true,
  });
  const next = db.recallVisit(visitId, 14);
  assert.ok(db.beginRecallDelivery(visitId, next.returnUntil, input.callbackPhone));
  db.recoverRecallDeliveries();
  assert.equal(db.listQueue()[0].recallNotifyStatus, 'unknown');
});

test('no fallback after patient returns while a status query is in flight', async (t) => {
  const { db, visitId, input } = fixture(t);
  globalThis.fetch = (async () => accepted('wa-1')) as typeof fetch;
  await dispatchRecallNotifyAndPersist(db, visitId, input);
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    db.returnToWaiting(visitId);
    return Response.json([{ id: 'wa-1', dlr: 'FAILED' }]);
  }) as typeof fetch;
  await pollRecallDeliveries(db);
  assert.equal(calls, 1);
  assert.equal(db.listRecallDeliveries().length, 0);
});

test('unknown and mismatched journal entries do not prove delivery failure', () => {
  assert.equal(parseDeliveryStatus([{ id: 'other', dlr: 'FAILED' }], 'wa-1'), null);
  assert.equal(parseDeliveryStatus([{ id: 'wa-1', dlr: 'BUFFERED' }], 'wa-1'), null);
  assert.equal(parseDeliveryStatus({ error: 'unavailable' }, 'wa-1'), null);
  assert.equal(parseDeliveryStatus([{ id: 'wa-1', dlr: 'read' }], 'wa-1'), 'delivered');
});

test('immediate rejection falls back and a failed SMS retries directly without WhatsApp', async (t) => {
  const { db, visitId, input } = fixture(t);
  const calls: string[] = [];
  globalThis.fetch = (async (url) => {
    calls.push(String(url));
    return Response.json({ success: '900' });
  }) as typeof fetch;
  const result = await dispatchRecallNotifyAndPersist(db, visitId, input);
  assert.equal(result.provider, 'seven');
  assert.equal(db.listQueue()[0].recallNotifyStatus, 'failed');
  db.retryRecallNotify(visitId);
  globalThis.fetch = (async (url) => {
    calls.push(String(url));
    return accepted('sms-2');
  }) as typeof fetch;
  await dispatchRecallNotifyAndPersist(db, visitId, input);
  assert.equal(calls.filter((url) => url.includes('/waba/')).length, 1);
  assert.equal(calls.filter((url) => url.includes('/api/sms')).length, 2);
  assert.equal(db.listQueue()[0].recallNotifyStatus, 'accepted');
});

test('SMS works without WhatsApp configuration, mock stays visibly simulated', async (t) => {
  const { db, visitId, input } = fixture(t);
  db.updateMessagingProviderConfig('seven_whatsapp', { enabled: false });
  const calls: string[] = [];
  globalThis.fetch = (async (url) => {
    calls.push(String(url));
    return accepted('sms-1');
  }) as typeof fetch;
  await dispatchRecallNotifyAndPersist(db, visitId, input);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes('/api/sms'));
  db.returnToWaiting(visitId);
  db.setAbsence(visitId, 'wait_here', {
    callbackPhone: input.callbackPhone,
    recallConsentConfirmed: true,
  });
  db.updateOpsSettings({ smsProvider: 'mock' });
  const next = db.recallVisit(visitId, 14);
  await dispatchRecallNotifyAndPersist(db, visitId, {
    ...next,
    callbackPhone: next.callbackPhone!,
  });
  assert.equal(db.listQueue()[0].recallNotifyStatus, 'simulated');
  assert.equal(calls.length, 1);
});
