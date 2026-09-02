import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  SETUP_API_HEALTH_PATH,
  SETUP_API_PROTOCOL_VERSION,
  SETUP_ATTACH_EXISTING_ENV,
  SETUP_BUILD_ID_ENV,
  SETUP_READY_LOG_PREFIX,
  type SetupHealthIdentity,
} from '@praxis-flow/server-shared/setup-api';
import { findProjectRoot } from './project-root.js';

export function isAttachExistingSetupEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env[SETUP_ATTACH_EXISTING_ENV]?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

export function createLineAssembler(): { push(chunk: string | Buffer): string[] } {
  let rest = '';
  return {
    push(chunk) {
      const combined = rest + String(chunk);
      const parts = combined.split(/\r?\n/);
      rest = parts.pop() ?? '';
      return parts;
    },
  };
}

export function parseSetupReadyLine(line: string): number | null {
  const index = line.indexOf(SETUP_READY_LOG_PREFIX);
  if (index === -1) {
    return null;
  }
  const raw = line.slice(index + SETUP_READY_LOG_PREFIX.length).trim();
  try {
    const parsed = JSON.parse(raw) as { port?: unknown };
    if (
      typeof parsed.port === 'number' &&
      Number.isInteger(parsed.port) &&
      parsed.port > 0 &&
      parsed.port <= 65_535
    ) {
      return parsed.port;
    }
  } catch {
    return null;
  }
  return null;
}

export function defaultOsInstallHome(): string {
  if (process.platform === 'win32') {
    const programData = process.env.ProgramData?.trim() || 'C:\\ProgramData';
    return path.join(programData, 'PraxisFlow');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'PraxisFlow');
  }
  return path.join(os.homedir(), '.local', 'share', 'PraxisFlow');
}

export function expectedSetupInstallHome(isPackaged: boolean, moduleDir: string): string {
  const fromEnv = process.env.PRAXIS_FLOW_HOME?.trim();
  if (fromEnv) {
    return path.resolve(fromEnv);
  }
  if (isPackaged) {
    return defaultOsInstallHome();
  }
  return findProjectRoot(moduleDir);
}

export function expectedSetupBuildId(isPackaged: boolean, moduleDir: string): string {
  const fromEnv = process.env[SETUP_BUILD_ID_ENV]?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const pkgPath = isPackaged
    ? path.join(process.resourcesPath, 'setup', 'package.json')
    : path.join(findProjectRoot(moduleDir), 'setup', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: unknown };
  if (typeof pkg.version === 'string' && pkg.version.trim()) {
    return pkg.version.trim();
  }
  throw new Error(`Setup-Build-ID nicht lesbar (${pkgPath})`);
}

export function managerInstanceUserDataKey(installHome: string): string {
  return createHash('sha256').update(installHome).digest('hex').slice(0, 12);
}

export function evaluateSetupHealthIdentity(
  body: unknown,
  expected: { protocolVersion: number; buildId: string; installHome: string },
): string | null {
  if (body === null || typeof body !== 'object') {
    return 'Setup-API Health antwortet nicht mit einem Identitätsobjekt.';
  }
  const health = body as Partial<SetupHealthIdentity>;
  if (health.ok !== true) {
    return 'Setup-API Health meldet nicht ok.';
  }
  if (health.protocolVersion !== expected.protocolVersion) {
    return `Setup-API protocolVersion ${expected.protocolVersion} erwartet, erhalten: ${String(health.protocolVersion)}.`;
  }
  if (typeof health.buildId !== 'string' || health.buildId !== expected.buildId) {
    return `Setup-API Build-ID ${expected.buildId} erwartet, erhalten: ${String(health.buildId)}.`;
  }
  if (typeof health.installHome !== 'string') {
    return 'Setup-API Health ohne installHome.';
  }
  if (path.resolve(health.installHome) !== path.resolve(expected.installHome)) {
    return `Setup-API Install-Home ${expected.installHome} erwartet, erhalten: ${health.installHome}.`;
  }
  return null;
}

export { SETUP_API_HEALTH_PATH, SETUP_API_PROTOCOL_VERSION };
