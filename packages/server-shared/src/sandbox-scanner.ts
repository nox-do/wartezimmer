export const FRESHCLAM_LOG_PATH = '/var/log/clamav/freshclam.log';

export type SandboxScannerStatus = {
  enabled: boolean;
  ready: boolean;
  signaturesFreshEnough: boolean;
  definitionsUpdatedAt: string | null;
  definitionsAgeHours: number | null;
  maxSignatureAgeHours: number;
  engineVersion: string | null;
  healthStatus: 'ready' | 'degraded' | null;
  freshclamLastAttemptAt: string | null;
  freshclamLastAttemptOk: boolean | null;
  freshclamLastAttemptMessage: string | null;
  freshclamLastAttemptSource: 'startup' | 'manual' | null;
  freshclamLogTail: string | null;
};

export function resolveMaxSignatureAgeHours(raw: string | undefined | null): number {
  const parsed = Number.parseInt(raw?.trim() ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 24;
}
