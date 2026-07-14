import assert from 'node:assert/strict';
import test from 'node:test';
import { setStaffSessionCookie } from './staff-session-cookies.js';

type HeaderSink = {
  values: string[];
  getHeader(name: string): string | string[] | undefined;
  header(name: string, value: string | string[]): void;
};

function createReply(): HeaderSink {
  return {
    values: [],
    getHeader(name: string) {
      if (name.toLowerCase() !== 'set-cookie') {
        return undefined;
      }
      if (this.values.length === 0) {
        return undefined;
      }
      return this.values.length === 1 ? this.values[0] : this.values;
    },
    header(name: string, value: string | string[]) {
      if (name.toLowerCase() !== 'set-cookie') {
        return;
      }
      if (Array.isArray(value)) {
        this.values.push(...value);
        return;
      }
      this.values.push(value);
    },
  };
}

function sessionCookieHeader(reply: HeaderSink): string {
  return reply.values.find((value) => value.startsWith('pf_mfa_session=')) ?? '';
}

test('setStaffSessionCookie does not force Secure only because NODE_ENV is production', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const reply = createReply();
    setStaffSessionCookie(
      reply as never,
      { protocol: 'http', headers: {} } as never,
      'mfa',
      'token',
      60_000,
    );
    assert.equal(sessionCookieHeader(reply).includes('; Secure'), false);
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
    'mfa',
    'token',
    60_000,
  );
  assert.equal(sessionCookieHeader(reply).includes('; Secure'), true);
});

test('setStaffSessionCookie ignores forwarded proto unless proxy headers are trusted', () => {
  const previousTrustProxyHeaders = process.env.TRUST_PROXY_HEADERS;
  delete process.env.TRUST_PROXY_HEADERS;
  try {
    const reply = createReply();
    setStaffSessionCookie(
      reply as never,
      { protocol: 'http', headers: { 'x-forwarded-proto': 'https' } } as never,
      'mfa',
      'token',
      60_000,
    );
    assert.equal(sessionCookieHeader(reply).includes('; Secure'), false);
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
      'mfa',
      'token',
      60_000,
    );
    assert.equal(sessionCookieHeader(reply).includes('; Secure'), true);
  } finally {
    if (previousTrustProxyHeaders === undefined) {
      delete process.env.TRUST_PROXY_HEADERS;
    } else {
      process.env.TRUST_PROXY_HEADERS = previousTrustProxyHeaders;
    }
  }
});

test('setStaffSessionCookie clears legacy pf_staff_session on login', () => {
  const reply = createReply();
  setStaffSessionCookie(
    reply as never,
    { protocol: 'http', headers: {} } as never,
    'mfa',
    'token',
    60_000,
  );
  assert.equal(reply.values.some((value) => value.startsWith('pf_staff_session=')), true);
});
