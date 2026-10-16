import { describe, expect, it } from 'vitest';
import { isPatientUploadTypeAllowed } from './patient-document-api';

describe('portal upload MIME types', () => {
  it.each(['application/pdf', 'image/jpeg', 'image/png'])('accepts %s', (type) => {
    expect(isPatientUploadTypeAllowed({ type })).toBe(true);
  });
  it.each([
    'text/html',
    'image/svg+xml',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
    '',
    'application/octet-stream',
  ])('rejects %s', (type) => {
    expect(isPatientUploadTypeAllowed({ type })).toBe(false);
  });
});
