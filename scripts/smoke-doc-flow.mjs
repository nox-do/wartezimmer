#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadRepoDotEnv } from './dotenv.mjs';
import {
  ensureCheckinAvailable,
  formatTicketCode,
  pairDeviceForSmoke,
  smokeStaffAuth,
} from './smoke-helpers.mjs';

const execFileAsync = promisify(execFile);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function dockerExec(container, command) {
  const { stdout } = await execFileAsync('docker', ['exec', container, 'sh', '-lc', command], {
    cwd: process.cwd(),
  });
  return stdout.trim();
}

function applyAuthHeaders(headers, auth) {
  const cookieHeader = auth?.cookieJar?.header();
  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }
  if (auth?.origin) {
    headers.origin = auth.origin;
  }
}

async function requestJson(
  baseUrl,
  method,
  endpoint,
  { bearerToken, auth, jsonBody, expectedStatus },
) {
  const startedAt = performance.now();
  const headers = {};
  if (jsonBody != null) {
    headers['content-type'] = 'application/json';
  }
  if (bearerToken) {
    headers.authorization = `Bearer ${bearerToken}`;
  }
  applyAuthHeaders(headers, auth);

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers,
    body: jsonBody != null ? JSON.stringify(jsonBody) : undefined,
  });

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
      `${method} ${endpoint} expected ${expectedStatus} but got ${response.status} (${durationMs} ms)\nResponse: ${JSON.stringify(body)}`,
    );
  }

  return {
    status: response.status,
    body,
    durationMs,
  };
}

async function fetchTimed(url) {
  const startedAt = performance.now();
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const durationMs = Math.round(performance.now() - startedAt);
  return {
    status: response.status,
    byteLength: buffer.byteLength,
    durationMs,
  };
}

const MINIMAL_PDF_BYTES = Buffer.from(
  [
    '%PDF-1.0',
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    '3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj',
    'xref',
    '0 4',
    'trailer<</Root 1 0 R>>',
    'startxref',
    '0',
    '%%EOF',
  ].join('\n'),
);

async function requestMultipart(
  baseUrl,
  endpoint,
  { bearerToken, auth, formData, expectedStatus },
) {
  const headers = {};
  if (bearerToken) {
    headers.authorization = `Bearer ${bearerToken}`;
  }
  applyAuthHeaders(headers, auth);

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers,
    body: formData,
  });

  const text = await response.text();
  let body = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (expectedStatus != null && response.status !== expectedStatus) {
    throw new Error(
      `POST ${endpoint} expected ${expectedStatus} but got ${response.status}\nResponse: ${JSON.stringify(body)}`,
    );
  }

  return {
    status: response.status,
    body,
  };
}

async function main() {
  loadRepoDotEnv();

  const baseUrl = process.env.SMOKE_BASE_URL ?? process.env.APP_BASE_URL ?? 'http://127.0.0.1:8080';
  const sandboxInternalToken = process.env.SANDBOX_INTERNAL_TOKEN;

  assert(sandboxInternalToken, 'SANDBOX_INTERNAL_TOKEN is required (env or .env)');
  const mfaAuth = await smokeStaffAuth(baseUrl, 'mfa');
  const terminalAuth = await pairDeviceForSmoke(baseUrl, 'terminal', mfaAuth, 'smoke-doc-terminal');

  await ensureCheckinAvailable(baseUrl, mfaAuth);

  console.log('1) Check-in erzeugen (Terminal-Pfad)');
  const checkin = await requestJson(baseUrl, 'POST', '/api/v1/checkins', {
    auth: terminalAuth,
    jsonBody: {
      topicId: 'offen',
      authPath: 'phone_dob',
    },
    expectedStatus: 201,
  });
  assert(
    checkin.body?.laneCode && Number.isInteger(checkin.body?.number),
    'Invalid check-in response',
  );
  const ticketCode = formatTicketCode(checkin.body.laneCode, checkin.body.number);
  const ticketId = checkin.body.ticketId;

  console.log(`   -> Ticket ${ticketCode} (${ticketId})`);

  console.log('2) Session aus Wartenummer aufloesen');
  const resolved = await requestJson(baseUrl, 'POST', '/api/v1/sessions/resolve-ticket', {
    jsonBody: { ticketCode },
    expectedStatus: 201,
  });
  const firstSessionToken = resolved.body?.sessionToken;
  const firstSessionId = resolved.body?.sessionId;
  assert(firstSessionToken, 'Missing session token');
  assert(firstSessionId, 'Missing session id');

  console.log('3) Session-Status lesen');
  const me = await requestJson(baseUrl, 'GET', '/api/v1/sessions/me', {
    bearerToken: firstSessionToken,
    expectedStatus: 200,
  });
  assert(me.body?.status === 'active', 'Session should be active');

  console.log('4) Zwei Dokumente hochladen');
  const formA = new FormData();
  formA.append(
    'file',
    new Blob([MINIMAL_PDF_BYTES], { type: 'application/pdf' }),
    'Laborzettel_Medikament.pdf',
  );
  const intakeA = await requestMultipart(baseUrl, '/api/v1/patient-documents/intake', {
    bearerToken: firstSessionToken,
    formData: formA,
    expectedStatus: 201,
  });

  const formB = new FormData();
  formB.append(
    'file',
    new Blob([MINIMAL_PDF_BYTES], { type: 'application/pdf' }),
    'Anamnese_Notizen.pdf',
  );
  const intakeB = await requestMultipart(baseUrl, '/api/v1/patient-documents/intake', {
    bearerToken: firstSessionToken,
    formData: formB,
    expectedStatus: 201,
  });
  const documentA = intakeA.body?.id;
  const documentB = intakeB.body?.id;
  assert(documentA && documentB, 'Missing document ids after intake');

  console.log('5) Upload-Liste sehen und ein Dokument patientenseitig loeschen');
  const listBeforeDelete = await requestJson(baseUrl, 'GET', '/api/v1/patient-documents', {
    bearerToken: firstSessionToken,
    expectedStatus: 200,
  });
  assert(Array.isArray(listBeforeDelete.body?.items), 'Expected patient document items');
  assert(listBeforeDelete.body.items.length >= 2, 'Expected at least 2 patient documents');

  const deleted = await requestJson(
    baseUrl,
    'POST',
    `/api/v1/patient-documents/${encodeURIComponent(documentA)}/delete`,
    {
      bearerToken: firstSessionToken,
      expectedStatus: 200,
    },
  );
  assert(
    deleted.body?.status === 'discarded_by_patient',
    'Deleted document should be discarded_by_patient',
  );

  console.log('6) Session mit "Senden" abschliessen');
  const submit = await requestJson(baseUrl, 'POST', '/api/v1/sessions/submit', {
    bearerToken: firstSessionToken,
    expectedStatus: 200,
  });
  assert(submit.body?.status === 'revoked', 'Submitted session should be revoked');

  console.log('7) Alte Session darf nicht mehr genutzt werden');
  await requestJson(baseUrl, 'GET', '/api/v1/sessions/me', {
    bearerToken: firstSessionToken,
    expectedStatus: 401,
  });
  await requestJson(baseUrl, 'GET', '/api/v1/patient-documents', {
    bearerToken: firstSessionToken,
    expectedStatus: 401,
  });

  console.log('8) Gleiche Wartenummer startet neue Session ohne alte Liste');
  const resolvedAgain = await requestJson(baseUrl, 'POST', '/api/v1/sessions/resolve-ticket', {
    jsonBody: { ticketCode },
    expectedStatus: 201,
  });
  const secondSessionToken = resolvedAgain.body?.sessionToken;
  const secondSessionId = resolvedAgain.body?.sessionId;
  assert(secondSessionToken && secondSessionId, 'Missing second session');
  assert(secondSessionId !== firstSessionId, 'Expected a new session id');

  const listSecondSession = await requestJson(baseUrl, 'GET', '/api/v1/patient-documents', {
    bearerToken: secondSessionToken,
    expectedStatus: 200,
  });
  assert(Array.isArray(listSecondSession.body?.items), 'Expected items in second session');
  assert(listSecondSession.body.items.length === 0, 'Second session should start with empty list');

  console.log('9) MFA sieht Ticket-Dokumente und startet Preview/Export');
  const mfaList = await requestJson(
    baseUrl,
    'GET',
    `/api/v1/documents/${encodeURIComponent(ticketId)}`,
    {
      auth: mfaAuth,
      expectedStatus: 200,
    },
  );
  assert(Array.isArray(mfaList.body?.items), 'Expected MFA document items');
  const candidate =
    mfaList.body.items.find((item) => item.id === documentB) ?? mfaList.body.items[0];
  assert(candidate?.id, 'Expected at least one MFA document candidate');

  assert(
    candidate.status === 'scan_clean',
    `Expected scan_clean before first preview, got ${candidate.status}`,
  );
  assert(
    intakeB.body?.status === 'scan_clean',
    `Expected scan_clean after intake, got ${intakeB.body?.status}`,
  );

  const preview = await requestJson(
    baseUrl,
    'POST',
    `/api/v1/documents/${encodeURIComponent(candidate.id)}/preview`,
    {
      auth: mfaAuth,
      expectedStatus: 200,
    },
  );
  assert(
    preview.body?.status === 'preview_requested',
    'Preview should set status preview_requested',
  );
  assert(preview.body?.preview?.status, 'Preview response should include preview handshake result');
  assert(preview.body?.preview?.embedUrl, 'First preview should include embed URL');

  const previewAgain = await requestJson(
    baseUrl,
    'POST',
    `/api/v1/documents/${encodeURIComponent(candidate.id)}/preview`,
    {
      auth: mfaAuth,
      expectedStatus: 200,
    },
  );
  assert(
    previewAgain.body?.status === 'preview_requested',
    'Re-preview should stay idempotent on preview_requested',
  );
  assert(previewAgain.body?.preview?.embedUrl, 'Re-preview should refresh sandbox embed');
  assert(
    previewAgain.body.preview.embedUrl.includes('access='),
    'Embed URL should include short-lived access token',
  );
  assert(
    previewAgain.body.preview.embedUrl.includes('documentId='),
    'Embed URL should include documentId query param',
  );

  const embedUrl = previewAgain.body.preview.embedUrl;
  const embedPath = embedUrl.startsWith('http') ? embedUrl : `${baseUrl}${embedUrl}`;
  const embedFetch = await fetchTimed(embedPath);

  console.log('\n--- Preview-Latenz (Smoke, minimales PDF) ---');
  console.log(`   1. POST preview (Sandbox bind, Scan beim Upload):  ${preview.durationMs} ms`);
  console.log(`   2. POST preview (Sandbox-Cache):       ${previewAgain.durationMs} ms`);
  console.log(
    `   3. GET embed (voller PDF-Body):         ${embedFetch.durationMs} ms (${embedFetch.byteLength} bytes, HTTP ${embedFetch.status})`,
  );
  if (preview.durationMs > 0) {
    const cacheGain = Math.max(0, preview.durationMs - previewAgain.durationMs);
    const cachePct = Math.round((cacheGain / preview.durationMs) * 100);
    console.log(`   -> 2. vs 1.: ${cacheGain} ms schneller (~${cachePct}% vom 1. Aufruf)`);
  }
  console.log('   Hinweis: In der UI kommt nach (1) noch iframe-Render dazu (Browser-PDF-Viewer).');
  assert(embedFetch.status === 200, `Embed fetch expected 200, got ${embedFetch.status}`);

  const exported = await requestJson(
    baseUrl,
    'POST',
    `/api/v1/documents/${encodeURIComponent(candidate.id)}/export-filesystem`,
    {
      auth: mfaAuth,
      expectedStatus: 200,
    },
  );
  assert(
    exported.body?.status === 'exported',
    'Export should synchronously finish with status exported',
  );

  console.log('10) Queue liefert documentCount fuer MFA-UI');
  const queue = await requestJson(baseUrl, 'GET', '/api/v1/queue', {
    auth: mfaAuth,
    expectedStatus: 200,
  });
  assert(queue.body?.view === 'mfa', 'Expected MFA queue view');
  const queueItem = Array.isArray(queue.body?.items)
    ? queue.body.items.find((item) => item.ticketId === ticketId)
    : null;
  assert(queueItem, 'Expected queue item for ticket');
  assert(typeof queueItem.documentCount === 'number', 'Queue item should expose documentCount');

  console.log('11) Scanner-E2E (EICAR beim Upload)');
  const eicarBytes = Buffer.from(
    'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
    'utf8',
  );
  const eicarForm = new FormData();
  eicarForm.append('file', new Blob([eicarBytes], { type: 'application/pdf' }), 'eicar-test.pdf');
  const eicarIntake = await requestMultipart(baseUrl, '/api/v1/patient-documents/intake', {
    bearerToken: secondSessionToken,
    formData: eicarForm,
    expectedStatus: 201,
  });
  assert(
    eicarIntake.body?.status === 'blocked_malware',
    `Expected blocked_malware after EICAR upload, got ${eicarIntake.body?.status}`,
  );

  console.log(
    '\nSmoke test erfolgreich: Dokumentenfluss + Intake-Scan (inkl. EICAR) sind konsistent.',
  );
}

main().catch((error) => {
  console.error('\nSmoke test fehlgeschlagen.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
