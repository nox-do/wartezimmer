import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dispatchRecallSms,
  dispatchRecallWhatsApp,
  formatReturnUntilTime,
  isProviderTimeoutErrorForTests,
  parseSevenGatewaySendResponse,
} from './sms-sender.js';
import type { CoreDatabase } from '../db/database.js';

const SEVEN_WHATSAPP_SUCCESS = {
  success: '100',
  total_price: 0.005,
  balance: 123.45,
  debug: 'false',
  sms_type: 'WA',
  messages: [
    {
      id: '12345678',
      sender: '4915112345678',
      recipient: '4917612345678',
      success: true,
      error: null,
      error_text: null,
    },
  ],
};

const recallInput = {
  ticketId: 'A-001',
  callbackPhone: '+4917612345678',
  returnWindowMinutes: 15,
  returnUntil: '2026-08-31T12:15:00.000Z',
  checkinLocale: 'de-DE',
};

function sevenDbStub(): CoreDatabase {
  return {
    getOpsSettings: () => ({
      smsProvider: 'seven',
      practiceProfileJson: JSON.stringify({ displayName: 'Testpraxis' }),
    }),
    getMessagingProviderRuntimeConfig: (id: string) => {
      if (id === 'seven') {
        return {
          providerId: 'seven',
          enabled: true,
          credentials: { apiKey: 'test-key' },
        };
      }
      if (id === 'seven_whatsapp') {
        return {
          providerId: 'seven_whatsapp',
          enabled: true,
          credentials: {
            apiKey: 'test-key',
            from: '4915111111111',
            template: 'hello_world',
            language: 'en',
          },
        };
      }
      return { providerId: id, enabled: false, credentials: {} };
    },
  } as unknown as CoreDatabase;
}

test('parseSevenGatewaySendResponse accepts documented WhatsApp success envelope', () => {
  const result = parseSevenGatewaySendResponse(SEVEN_WHATSAPP_SUCCESS, 'seven_whatsapp');
  assert.equal(result.sent, true);
  assert.equal(result.provider, 'seven_whatsapp');
  assert.equal(result.messageId, '12345678');
  assert.equal(result.errorCode, undefined);
});

test('parseSevenGatewaySendResponse rejects missing messages as invalid', () => {
  const result = parseSevenGatewaySendResponse({ success: true, id: 'legacy' }, 'seven_whatsapp');
  assert.equal(result.sent, false);
  assert.equal(result.errorCode, 'true');
});

test('formatReturnUntilTime uses BUSINESS_TZ even when process TZ is UTC', () => {
  const previousBusinessTz = process.env.BUSINESS_TZ;
  const previousTz = process.env.TZ;
  process.env.BUSINESS_TZ = 'Europe/Berlin';
  process.env.TZ = 'UTC';
  try {
    // 12:15 UTC = 14:15 CEST in summer
    assert.equal(formatReturnUntilTime('2026-08-31T12:15:00.000Z', 'de-DE'), '14:15');
    // 12:15 UTC = 13:15 CET in winter
    assert.equal(formatReturnUntilTime('2026-01-15T12:15:00.000Z', 'de-DE'), '13:15');
  } finally {
    if (previousBusinessTz === undefined) {
      delete process.env.BUSINESS_TZ;
    } else {
      process.env.BUSINESS_TZ = previousBusinessTz;
    }
    if (previousTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previousTz;
    }
  }
});

test('isProviderTimeoutError recognizes TimeoutError and AbortError', () => {
  assert.equal(isProviderTimeoutErrorForTests(new DOMException('aborted', 'TimeoutError')), true);
  assert.equal(isProviderTimeoutErrorForTests(new DOMException('aborted', 'AbortError')), true);
  assert.equal(isProviderTimeoutErrorForTests(new Error('network')), false);
});

test('dispatchRecallSms maps header-phase TimeoutError to SEVEN_TIMEOUT', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  }) as typeof fetch;
  try {
    const result = await dispatchRecallSms(sevenDbStub(), recallInput);
    assert.equal(result.sent, false);
    assert.equal(result.errorCode, 'SEVEN_TIMEOUT');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('dispatchRecallSms maps body-phase TimeoutError to SEVEN_TIMEOUT', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: true,
      status: 200,
      async json() {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      },
    }) as Response) as typeof fetch;
  try {
    const result = await dispatchRecallSms(sevenDbStub(), recallInput);
    assert.equal(result.sent, false);
    assert.equal(result.errorCode, 'SEVEN_TIMEOUT');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('dispatchRecallWhatsApp maps header-phase TimeoutError to SEVEN_WHATSAPP_TIMEOUT', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  }) as typeof fetch;
  try {
    const result = await dispatchRecallWhatsApp(sevenDbStub(), recallInput);
    assert.equal(result.sent, false);
    assert.equal(result.errorCode, 'SEVEN_WHATSAPP_TIMEOUT');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
