import assert from 'node:assert/strict';
import test from 'node:test';
import { setStaffSessionCookie } from './staff-session-cookies.js';

type HeaderSink = {
  value: string | null;
  header(name: string, value: string): void;
};

function createReply(): HeaderSink {
  return {
    value: null,
    header(name: string, value: string) {
      if (name.toLowerCase() === 'set-cookie') {
        this.value = value;
      }
    },
  };
}

test('setStaffSessionCookie does not force Secure only because NODE_ENV is production', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const reply = createReply();
    setStaffSessionCookie(
      reply as never,
      { protocol: 'http', headers: {} } as never,
      'token',
      60_000,
    );
    assert.equal(reply.value?.includes('; Secure'), false);
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});

test('setStaffSessionCookie marks Secure when request is HTTPS', () => {
  const reply = createReply();
  setStaffSessionCookie(
    reply as never,
    { protocol: 'https', headers: {} } as never,
    'token',
    60_000,
  );
  assert.equal(reply.value?.includes('; Secure'), true);
});

test('setStaffSessionCookie ignores forwarded proto unless proxy headers are trusted', () => {
  const previousTrustProxyHeaders = process.env.TRUST_PROXY_HEADERS;
  delete process.env.TRUST_PROXY_HEADERS;
  try {
    const reply = createReply();
    setStaffSessionCookie(
      reply as never,
      { protocol: 'http', headers: { 'x-forwarded-proto': 'https' } } as never,
      'token',
      60_000,
    );
    assert.equal(reply.value?.includes('; Secure'), false);
  } finally {
    if (previousTrustProxyHeaders === undefined) {
      delete process.env.TRUST_PROXY_HEADERS;
    } else {
      process.env.TRUST_PROXY_HEADERS = previousTrustProxyHeaders;
    }
  }
});

test('setStaffSessionCookie marks Secure behind trusted HTTPS proxy', () => {
  const previousTrustProxyHeaders = process.env.TRUST_PROXY_HEADERS;
  process.env.TRUST_PROXY_HEADERS = 'true';
  try {
    const reply = createReply();
    setStaffSessionCookie(
      reply as never,
      { protocol: 'http', headers: { 'x-forwarded-proto': 'https' } } as never,
      'token',
      60_000,
    );
    assert.equal(reply.value?.includes('; Secure'), true);
  } finally {
    if (previousTrustProxyHeaders === undefined) {
      delete process.env.TRUST_PROXY_HEADERS;
    } else {
      process.env.TRUST_PROXY_HEADERS = previousTrustProxyHeaders;
    }
  }
});
