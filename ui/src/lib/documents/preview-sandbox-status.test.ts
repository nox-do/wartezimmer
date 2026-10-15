import { describe, it, expect } from 'vitest';
import { documentScanStatusMessage, previewSandboxStatusMessage } from './preview-sandbox-status';

describe('document scan messages', () => {
  it.each([
    ['blocked_malware', 'previewBlockedMalware'],
    ['scan_error', 'previewScanError'],
    ['received', 'previewScanning'],
    ['scanning', 'previewScanning'],
  ])('shows a blocking explanation for %s', (status, message) => {
    expect(documentScanStatusMessage(status)).toBe(message);
  });
  it.each(['scan_clean', 'preview_requested', 'export_requested'])(
    'allows preview requests for %s',
    (status) => {
      expect(documentScanStatusMessage(status)).toBeNull();
    },
  );
  it('also explains failures discovered during preview', () => {
    expect(previewSandboxStatusMessage('blocked_malware')).toBe('previewBlockedMalware');
    expect(previewSandboxStatusMessage('render_error')).toBe('previewRenderError');
    expect(previewSandboxStatusMessage('source_unavailable')).toBe('previewSourceUnavailable');
  });
});
