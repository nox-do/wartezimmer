import { describe, expect, it } from 'vitest';
import { resolveReceiptTopicLabel } from './terminal-receipt-topic-label';

describe('resolveReceiptTopicLabel', () => {
  it('uses Empfang label for no-auth reception path', () => {
    expect(
      resolveReceiptTopicLabel(
        { authPath: 'none', topicId: 'mfa', topicLabel: undefined },
        'Empfang',
      ),
    ).toBe('Empfang');
  });

  it('uses topic label for normal check-in', () => {
    expect(
      resolveReceiptTopicLabel(
        { authPath: 'phone_dob', topicId: 'termin-habe', topicLabel: 'Ich habe einen Termin' },
        'Empfang',
      ),
    ).toBe('Ich habe einen Termin');
  });

  it('falls back to topicId when label missing', () => {
    expect(
      resolveReceiptTopicLabel(
        { authPath: 'phone_dob', topicId: 'rezept', topicLabel: undefined },
        'Empfang',
      ),
    ).toBe('rezept');
  });
});
