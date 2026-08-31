import type { CoreDatabase } from '../db/database.js';
import { isTerminalPatientLocale, type TerminalPatientLocale } from '@praxis-flow/domain';
import { isRecord } from '../type-guards.js';
import { parsePracticeProfileJson } from '../practice/practice-profile.js';
import { resolveBusinessTimeZone } from '../practice-time-windows.js';

export type MessageDispatchResult = {
  provider: string;
  attempted: boolean;
  sent: boolean;
  messageId?: string;
  errorCode?: string;
  /** Set when WhatsApp was tried first and SMS carried the delivery. */
  fallbackFrom?: string;
};

type RecallMessageInput = {
  ticketId: string;
  callbackPhone: string;
  returnWindowMinutes: number;
  returnUntil: string;
  checkinLocale?: string | null;
  practiceName?: string;
};

const PROVIDER_FETCH_TIMEOUT_MS = 8_000;

const RECALL_SMS_BY_LOCALE: Record<
  TerminalPatientLocale,
  (practiceName: string, time: string, ticketId: string) => string
> = {
  'de-DE': (practiceName, time, ticketId) =>
    `${practiceName}: Bitte kommen Sie bis ${time} Uhr zurück. Ihre Wartenummer ${ticketId} bleibt bis dahin reserviert.`,
  'en-GB': (practiceName, time, ticketId) =>
    `${practiceName}: Please return by ${time}. Your queue number ${ticketId} stays reserved until then.`,
  'tr-TR': (practiceName, time, ticketId) =>
    `${practiceName}: Lütfen en geç ${time} saatine kadar geri gelin. Sıra numaranız ${ticketId} bu saate kadar ayrılmıştır.`,
  'ru-RU': (practiceName, time, ticketId) =>
    `${practiceName}: Пожалуйста, вернитесь до ${time}. Ваш номер очереди ${ticketId} сохраняется до этого времени.`,
  'uk-UA': (practiceName, time, ticketId) =>
    `${practiceName}: Будь ласка, поверніться до ${time}. Ваш номер у черзі ${ticketId} зберігається до цього часу.`,
};

function resolvePracticeName(db: CoreDatabase): string {
  const displayName = parsePracticeProfileJson(
    db.getOpsSettings().practiceProfileJson,
  ).displayName.trim();
  return displayName || 'Ihre Praxis';
}

function resolveRecallSmsLocale(rawLocale: string | null | undefined): TerminalPatientLocale {
  const locale = rawLocale?.trim() ?? '';
  return isTerminalPatientLocale(locale) ? locale : 'de-DE';
}

/** Exported for unit tests (BUSINESS_TZ / UTC process). */
export function formatReturnUntilTime(
  returnUntil: string,
  locale: TerminalPatientLocale = 'de-DE',
): string {
  const date = new Date(returnUntil);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }
  return new Intl.DateTimeFormat(locale, {
    timeZone: resolveBusinessTimeZone(),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function formatRecallMessage(input: RecallMessageInput): string {
  const locale = resolveRecallSmsLocale(input.checkinLocale);
  const time = formatReturnUntilTime(input.returnUntil, locale);
  const practiceName = input.practiceName?.trim() || 'Ihre Praxis';
  return RECALL_SMS_BY_LOCALE[locale](practiceName, time, input.ticketId);
}

/** WhatsApp template body params: {{1}} return time, {{2}} ticket code (A-001). */
export function buildRecallWhatsAppComponents(input: {
  ticketId: string;
  returnUntil: string;
  checkinLocale?: string | null;
}): {
  body: Array<{ type: 'text'; text: string }>;
} {
  const locale = resolveRecallSmsLocale(input.checkinLocale);
  const time = formatReturnUntilTime(input.returnUntil, locale);
  return {
    body: [
      { type: 'text', text: time },
      { type: 'text', text: input.ticketId },
    ],
  };
}

function isProviderTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
  );
}

/** Exported for unit tests. */
export function isProviderTimeoutErrorForTests(error: unknown): boolean {
  return isProviderTimeoutError(error);
}

async function readJsonPayload(
  response: Response,
  signal: AbortSignal,
): Promise<{ payload: unknown; timedOut: boolean }> {
  try {
    return { payload: await response.json(), timedOut: false };
  } catch (error) {
    if (isProviderTimeoutError(error) || signal.aborted) {
      return { payload: null, timedOut: true };
    }
    return { payload: null, timedOut: false };
  }
}

/** Parse seven.io JSON send response (SMS + WhatsApp share the same envelope). */
export function parseSevenGatewaySendResponse(
  payload: unknown,
  provider: 'seven' | 'seven_whatsapp',
): MessageDispatchResult {
  const data = isRecord(payload) ? payload : null;
  const messages = Array.isArray(data?.messages) ? data.messages : undefined;
  const firstMessage = messages?.[0];
  const firstMessageRecord = isRecord(firstMessage) ? firstMessage : undefined;
  const successCode = String(data?.success ?? '');
  const accepted = successCode === '100' || firstMessageRecord?.success === true;

  if (!accepted) {
    const fallbackCode =
      provider === 'seven' ? 'SEVEN_SEND_FAILED' : 'SEVEN_WHATSAPP_INVALID_RESPONSE';
    return {
      provider,
      attempted: true,
      sent: false,
      errorCode: String(firstMessageRecord?.error ?? data?.success ?? fallbackCode),
    };
  }

  return {
    provider,
    attempted: true,
    sent: true,
    messageId: typeof firstMessageRecord?.id === 'string' ? firstMessageRecord.id : undefined,
  };
}

async function sendWithSeven(
  apiKey: string,
  from: string | undefined,
  input: RecallMessageInput,
): Promise<MessageDispatchResult> {
  const body = new URLSearchParams({
    to: input.callbackPhone,
    text: formatRecallMessage(input),
    json: '1',
  });
  if (from && from.trim().length > 0) {
    body.set('from', from.trim());
  }

  const signal = AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch('https://gateway.seven.io/api/sms', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      signal,
    });
  } catch (error) {
    return {
      provider: 'seven',
      attempted: true,
      sent: false,
      errorCode: isProviderTimeoutError(error) ? 'SEVEN_TIMEOUT' : 'SEVEN_UNREACHABLE',
    };
  }

  const { payload, timedOut } = await readJsonPayload(response, signal);
  if (timedOut) {
    return {
      provider: 'seven',
      attempted: true,
      sent: false,
      errorCode: 'SEVEN_TIMEOUT',
    };
  }

  if (!response.ok) {
    return {
      provider: 'seven',
      attempted: true,
      sent: false,
      errorCode: `SEVEN_HTTP_${response.status}`,
    };
  }

  return parseSevenGatewaySendResponse(payload, 'seven');
}

async function sendWithSevenWhatsApp(
  apiKey: string,
  from: string,
  template: string,
  language: string,
  input: RecallMessageInput,
): Promise<MessageDispatchResult> {
  const signal = AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch('https://gateway.seven.io/api/waba/messages', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: input.callbackPhone,
        type: 'template',
        template,
        language,
        components: buildRecallWhatsAppComponents(input),
      }),
      signal,
    });
  } catch (error) {
    return {
      provider: 'seven_whatsapp',
      attempted: true,
      sent: false,
      errorCode: isProviderTimeoutError(error)
        ? 'SEVEN_WHATSAPP_TIMEOUT'
        : 'SEVEN_WHATSAPP_UNREACHABLE',
    };
  }

  const { payload, timedOut } = await readJsonPayload(response, signal);
  if (timedOut) {
    return {
      provider: 'seven_whatsapp',
      attempted: true,
      sent: false,
      errorCode: 'SEVEN_WHATSAPP_TIMEOUT',
    };
  }

  if (!response.ok) {
    return {
      provider: 'seven_whatsapp',
      attempted: true,
      sent: false,
      errorCode: `SEVEN_WHATSAPP_HTTP_${response.status}`,
    };
  }

  return parseSevenGatewaySendResponse(payload, 'seven_whatsapp');
}

export async function dispatchRecallSms(
  db: CoreDatabase,
  input: RecallMessageInput,
): Promise<MessageDispatchResult> {
  const messageInput = {
    ...input,
    practiceName: resolvePracticeName(db),
  };
  const smsProvider = db.getOpsSettings().smsProvider;
  if (smsProvider === 'mock') {
    return {
      provider: 'mock',
      attempted: true,
      sent: true,
      messageId: `mock-${Date.now()}`,
    };
  }

  if (smsProvider === 'seven') {
    const runtime = db.getMessagingProviderRuntimeConfig('seven');
    const apiKey = resolveSevenApiKey(db, 'seven');
    if (!runtime.enabled || !apiKey) {
      return {
        provider: 'seven',
        attempted: false,
        sent: false,
        errorCode: 'SEVEN_NOT_CONFIGURED',
      };
    }

    return sendWithSeven(apiKey, runtime.credentials.from, messageInput);
  }

  return {
    provider: smsProvider,
    attempted: false,
    sent: false,
    errorCode: 'SMS_PROVIDER_UNSUPPORTED',
  };
}

function resolveSevenApiKey(
  db: CoreDatabase,
  primaryProviderId: 'seven' | 'seven_whatsapp',
): string | undefined {
  const primary = db.getMessagingProviderRuntimeConfig(primaryProviderId);
  const primaryKey = primary.credentials.apiKey?.trim();
  if (primaryKey) {
    return primaryKey;
  }
  const fallbackProviderId = primaryProviderId === 'seven' ? 'seven_whatsapp' : 'seven';
  return db.getMessagingProviderRuntimeConfig(fallbackProviderId).credentials.apiKey?.trim();
}

export async function dispatchRecallWhatsApp(
  db: CoreDatabase,
  input: RecallMessageInput,
): Promise<MessageDispatchResult> {
  const runtime = db.getMessagingProviderRuntimeConfig('seven_whatsapp');
  const apiKey = resolveSevenApiKey(db, 'seven_whatsapp');
  const from = runtime.credentials.from?.trim();
  const template = runtime.credentials.template?.trim();
  const language = runtime.credentials.language?.trim() || 'de';
  if (!runtime.enabled || !apiKey || !from || !template) {
    return {
      provider: 'seven_whatsapp',
      attempted: false,
      sent: false,
      errorCode: 'SEVEN_WHATSAPP_NOT_CONFIGURED',
    };
  }

  return sendWithSevenWhatsApp(apiKey, from, template, language, input);
}

/** Try WhatsApp first; fall back to SMS when WhatsApp is unavailable or fails. */
export async function dispatchRecallWithFallback(
  db: CoreDatabase,
  input: RecallMessageInput,
): Promise<MessageDispatchResult> {
  const whatsapp = await dispatchRecallWhatsApp(db, input);
  if (whatsapp.sent) {
    return whatsapp;
  }

  const sms = await dispatchRecallSms(db, input);
  if (sms.sent) {
    if (whatsapp.attempted) {
      return {
        ...sms,
        fallbackFrom: 'seven_whatsapp',
      };
    }
    return sms;
  }

  return sms.attempted ? sms : whatsapp;
}
