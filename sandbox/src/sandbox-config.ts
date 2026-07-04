import { resolveMaxSignatureAgeHours } from '@praxis-flow/server-shared';

export type SandboxConfig = {
  docsBasePath: string;
  intakeBasePath: string;
  scannerDbPath: string;
  scanEnabled: boolean;
  scanTimeoutMs: number;
  maxSignatureAgeHours: number;
  sandboxAuthEnabled: boolean;
  sandboxInternalToken: string;
  host: string;
  port: number;
};

export function getSandboxConfig(): SandboxConfig {
  const explicitSandboxAuthEnabled = process.env.SANDBOX_AUTH_ENABLED?.trim();
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const sandboxAuthEnabled = explicitSandboxAuthEnabled
    ? explicitSandboxAuthEnabled === 'true'
    : nodeEnv !== 'development';
  const sandboxInternalToken = process.env.SANDBOX_INTERNAL_TOKEN?.trim() ?? '';

  if (sandboxAuthEnabled && sandboxInternalToken.length === 0) {
    throw new Error('SANDBOX_INTERNAL_TOKEN is required when SANDBOX_AUTH_ENABLED=true');
  }

  return {
    docsBasePath: process.env.DOCS_BASE_PATH?.trim() || '/var/lib/praxis-flow/docs',
    intakeBasePath:
      process.env.SANDBOX_INTAKE_BASE_PATH?.trim() || '/var/lib/praxis-flow/sandbox-intake',
    scannerDbPath: process.env.CLAMAV_DB_PATH?.trim() || '/var/lib/clamav',
    scanEnabled: (process.env.SANDBOX_SCAN_ENABLED?.trim() ?? 'true') === 'true',
    scanTimeoutMs: Number.parseInt(process.env.SANDBOX_SCAN_TIMEOUT_MS?.trim() ?? '', 10) || 15000,
    maxSignatureAgeHours: resolveMaxSignatureAgeHours(process.env.CLAMAV_MAX_SIGNATURE_AGE_HOURS),
    sandboxAuthEnabled,
    sandboxInternalToken,
    host: process.env.HOST ?? '0.0.0.0',
    port: Number(process.env.PORT ?? 8081),
  };
}
