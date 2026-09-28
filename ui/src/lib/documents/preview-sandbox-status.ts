export function previewSandboxStatusMessage(status: string | undefined): string | null {
  switch (status) {
    case 'ready':
      return null;
    case 'source_unavailable':
      return 'previewSourceUnavailable';
    case 'render_error':
      return 'previewRenderError';
    case 'blocked_malware':
      return 'previewBlockedMalware';
    case 'scanning':
      return 'previewScanning';
    default:
      return status ? 'previewUnavailable' : null;
  }
}
