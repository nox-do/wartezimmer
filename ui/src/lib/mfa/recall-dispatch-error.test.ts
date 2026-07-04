import { describe, expect, it } from 'vitest';
import { resolveRecallDispatchErrorKey } from './recall-dispatch-error';

describe('resolveRecallDispatchErrorKey', () => {
  it('maps seven invalid recipient to invalid number', () => {
    expect(resolveRecallDispatchErrorKey('202')).toBe('mfa.recallSmsErrorInvalidNumber');
    expect(resolveRecallDispatchErrorKey('SEVEN_SEND_FAILED_202')).toBe(
      'mfa.recallSmsErrorInvalidNumber',
    );
  });

  it('maps configuration errors', () => {
    expect(resolveRecallDispatchErrorKey('SEVEN_NOT_CONFIGURED')).toBe(
      'mfa.recallSmsErrorNotConfigured',
    );
  });

  it('maps network errors', () => {
    expect(resolveRecallDispatchErrorKey('SEVEN_UNREACHABLE')).toBe('mfa.recallSmsErrorNetwork');
  });
});
