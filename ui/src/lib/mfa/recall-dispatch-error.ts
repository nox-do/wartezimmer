/** Maps recall SMS/WhatsApp dispatch error codes to MFA-facing copy keys. */
export type RecallDispatchErrorKey =
  | 'mfa.recallSmsErrorInvalidNumber'
  | 'mfa.recallSmsErrorNotConfigured'
  | 'mfa.recallSmsErrorNetwork'
  | 'mfa.recallSmsErrorInsufficientCredit'
  | 'mfa.recallSmsErrorGeneric'
  | 'mfa.recallSmsErrorConsentRequired';

export function resolveRecallDispatchErrorKey(
  errorCode: string | undefined,
): RecallDispatchErrorKey {
  const code = errorCode?.trim() ?? '';
  if (code === 'RECALL_CONSENT_REQUIRED') return 'mfa.recallSmsErrorConsentRequired';
  if (!code) {
    return 'mfa.recallSmsErrorGeneric';
  }

  if (
    code === '202' ||
    code.endsWith('_202') ||
    /\b202\b/.test(code) ||
    /INVALID.*NUMBER|RECIPIENT|INVALID_TO/i.test(code)
  ) {
    return 'mfa.recallSmsErrorInvalidNumber';
  }

  if (
    code === 'SEVEN_NOT_CONFIGURED' ||
    code === 'SEVEN_WHATSAPP_NOT_CONFIGURED' ||
    code === 'SMS_PROVIDER_UNSUPPORTED'
  ) {
    return 'mfa.recallSmsErrorNotConfigured';
  }

  if (
    code === 'SEVEN_UNREACHABLE' ||
    code === 'SEVEN_WHATSAPP_UNREACHABLE' ||
    code === 'SEVEN_TIMEOUT' ||
    code === 'SEVEN_WHATSAPP_TIMEOUT' ||
    code.startsWith('SEVEN_HTTP_') ||
    code.startsWith('SEVEN_WHATSAPP_HTTP_')
  ) {
    return 'mfa.recallSmsErrorNetwork';
  }

  if (code === '500' || /INSUFFICIENT|CREDIT/i.test(code)) {
    return 'mfa.recallSmsErrorInsufficientCredit';
  }

  return 'mfa.recallSmsErrorGeneric';
}
