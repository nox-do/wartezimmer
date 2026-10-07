#!/usr/bin/env node

export { formatTicketCode } from '@wartezimmer/domain';

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function splitCombinedSetCookieHeader(header) {
  if (!header) {
    return [];
  }

  return header.split(/,(?=\s*[^;,=\s]+=[^;,]*)/g).map((value) => value.trim());
}

export function createCookieJar() {
  const cookies = new Map();

  return {
    add(setCookieHeader) {
      for (const cookieHeader of Array.isArray(setCookieHeader)
        ? setCookieHeader
        : splitCombinedSetCookieHeader(setCookieHeader)) {
        const [nameValue] = String(cookieHeader).split(';');
        const separatorIndex = nameValue.indexOf('=');
        if (separatorIndex <= 0) {
          continue;
        }
        const name = nameValue.slice(0, separatorIndex).trim();
        const value = nameValue.slice(separatorIndex + 1).trim();
        if (value === '') {
          cookies.delete(name);
        } else {
          cookies.set(name, value);
        }
      }
    },
    addFromResponse(response) {
      const setCookieHeaders =
        typeof response.headers.getSetCookie === 'function'
          ? response.headers.getSetCookie()
          : splitCombinedSetCookieHeader(response.headers.get('set-cookie'));
      this.add(setCookieHeaders);
    },
    header() {
      return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
    },
    isEmpty() {
      return cookies.size === 0;
    },
  };
}

function csrfTokenFromBody(body) {
  return body?.csrfToken ?? body?.csrf?.token ?? body?.session?.csrfToken ?? null;
}

export function captiveBearerAuth(env = process.env) {
  return { kind: 'bearer', role: 'captive', bearerToken: env.AUTH_KEY_CAPTIVE?.trim() ?? '' };
}

export function staffPin(role, env = process.env) {
  const roleKey = String(role)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_');
  return env[`SMOKE_STAFF_PIN_${roleKey}`]?.trim() ?? env[`AUTH_PIN_${roleKey}`]?.trim() ?? '';
}

export async function loginStaff(
  baseUrl,
  role,
  pin,
  {
    endpoint = process.env.SMOKE_AUTH_LOGIN_ENDPOINT ?? '/api/v1/auth/login',
    origin = process.env.SMOKE_AUTH_ORIGIN ?? baseUrl,
    expectedStatus = 200,
    allowMissingEndpoint = false,
  } = {},
) {
  if (!pin && allowMissingEndpoint) {
    const probe = await requestJson(baseUrl, 'POST', endpoint, {
      origin,
      jsonBody: { role, pin: '' },
    });
    if (probe.status === 404 || probe.status === 405 || probe.status === 501) {
      return null;
    }
  }

  assert(
    pin,
    `PIN missing for ${role}; set SMOKE_STAFF_PIN_${String(role).toUpperCase()} or AUTH_PIN_${String(role).toUpperCase()}`,
  );

  const cookieJar = createCookieJar();
  const response = await requestJson(baseUrl, 'POST', endpoint, {
    cookieJar,
    origin,
    jsonBody: { role, pin },
  });

  if (
    allowMissingEndpoint &&
    (response.status === 404 || response.status === 405 || response.status === 501)
  ) {
    return null;
  }
  if (response.status !== expectedStatus) {
    throw new Error(
      `POST ${endpoint} expected ${expectedStatus} but got ${response.status}\nResponse: ${JSON.stringify(response.body)}`,
    );
  }
  if (cookieJar.isEmpty()) {
    throw new Error(`POST ${endpoint} did not set a session cookie`);
  }

  return {
    kind: 'session',
    role,
    cookieJar,
    csrfToken: csrfTokenFromBody(response.body),
    origin,
  };
}

export async function smokeStaffAuth(
  baseUrl,
  role,
  { env = process.env, pin = staffPin(role, env) } = {},
) {
  return loginStaff(baseUrl, role, pin);
}

export async function pairDeviceForSmoke(baseUrl, role, mfaAuth, displayId = `smoke-${role}`) {
  assert(role === 'terminal' || role === 'tv', `Unsupported device role for pairing: ${role}`);
  const start = await requestJson(baseUrl, 'POST', `/api/v1/auth/${role}/pairing/start`, {
    jsonBody: { displayId },
    expectedStatus: 200,
  });
  assert(/^[0-9]{4}$/.test(start.body?.code ?? ''), `unexpected ${role} pairing code`);

  await requestJson(baseUrl, 'POST', `/api/v1/auth/${role}/pairing/confirm`, {
    auth: mfaAuth,
    jsonBody: { code: start.body.code },
    expectedStatus: 200,
  });

  const cookieJar = createCookieJar();
  const paired = await requestJson(
    baseUrl,
    'GET',
    `/api/v1/auth/${role}/pairing/${start.body.pairingId}`,
    {
      cookieJar,
      expectedStatus: 200,
    },
  );
  assert(paired.body?.paired === true, `${role} pairing did not complete`);
  assert(!cookieJar.isEmpty(), `${role} pairing did not set a device cookie`);
  return { kind: 'device', role, cookieJar, origin: baseUrl };
}

function applyAuthHeaders(headers, auth) {
  if (!auth) {
    return;
  }
  if (auth.bearerToken) {
    headers.authorization = `Bearer ${auth.bearerToken}`;
  }
  const cookieHeader = auth.cookieJar?.header();
  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }
  if (auth.csrfToken) {
    headers['x-csrf-token'] = auth.csrfToken;
  }
  if (auth.origin) {
    headers.origin = auth.origin;
  }
  if (auth.kind === 'session' || auth.kind === 'device') {
    headers['x-client-role'] = auth.role;
  }
}

export async function requestJson(
  baseUrl,
  method,
  endpoint,
  {
    bearerToken,
    auth,
    cookieJar,
    csrfToken,
    origin,
    headers: extraHeaders,
    jsonBody,
    expectedStatus,
  } = {},
) {
  const startedAt = performance.now();
  const headers = { ...(extraHeaders ?? {}) };
  if (jsonBody != null) {
    headers['content-type'] = 'application/json';
  }
  if (bearerToken) {
    headers.authorization = `Bearer ${bearerToken}`;
  }
  applyAuthHeaders(headers, auth);
  const jar = cookieJar ?? auth?.cookieJar;
  const cookieHeader = jar?.header();
  if (cookieHeader && headers.cookie == null) {
    headers.cookie = cookieHeader;
  }
  if (csrfToken && headers['x-csrf-token'] == null) {
    headers['x-csrf-token'] = csrfToken;
  }
  if (origin && headers.origin == null) {
    headers.origin = origin;
  }

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers,
    body: jsonBody != null ? JSON.stringify(jsonBody) : undefined,
  });
  jar?.addFromResponse(response);

  const text = await response.text();
  let body = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  const durationMs = Math.round(performance.now() - startedAt);

  if (expectedStatus != null && response.status !== expectedStatus) {
    throw new Error(
      `${method} ${endpoint} expected ${expectedStatus} but got ${response.status}\nResponse: ${JSON.stringify(body)}`,
    );
  }

  return { status: response.status, body, durationMs };
}

/** Opens terminal check-in when a new business day was not started yet or check-in is locked. */
export async function ensureCheckinAvailable(baseUrl, mfaAuth) {
  let lifecycle = await requestJson(baseUrl, 'GET', '/api/v1/ops/day-lifecycle', {
    auth: mfaAuth,
    expectedStatus: 200,
  });

  if (lifecycle.body?.needsDayStartHint === true) {
    await requestJson(baseUrl, 'POST', '/api/v1/ops/day-lifecycle/reset', {
      auth: mfaAuth,
      jsonBody: { confirmBusinessDayReset: true },
      expectedStatus: 200,
    });
    lifecycle = await requestJson(baseUrl, 'GET', '/api/v1/ops/day-lifecycle', {
      auth: mfaAuth,
      expectedStatus: 200,
    });
  }

  if (lifecycle.body?.checkinLocked === true) {
    await requestJson(baseUrl, 'POST', '/api/v1/ops/checkin-lock', {
      auth: mfaAuth,
      jsonBody: { locked: false },
      expectedStatus: 200,
    });
  }
}
