import { assertWindowsHostPath } from './windows-host-path.js';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

/** Override for dev/test installs (e.g. `/tmp/pf-dev-001`). */
export function resolveInstallHomeFromEnv(): string | null {
  const raw = process.env.PRAXIS_FLOW_HOME?.trim();
  if (raw) assertWindowsHostPath(raw);
  return raw ? path.resolve(raw) : null;
}

/** Delivery default when not in the monorepo and `PRAXIS_FLOW_HOME` is unset. */
export function defaultOsInstallHome(): string {
  if (process.platform === 'win32') {
    const legacy = path.join(process.env.ProgramData?.trim() || 'C:\\ProgramData', 'PraxisFlow');
    // Never silently abandon an existing Windows installation.
    if (fs.existsSync(legacy)) return legacy;
    return path.join(
      process.env.LOCALAPPDATA?.trim() || path.join(os.homedir(), 'AppData', 'Local'),
      'PraxisFlow',
    );
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'PraxisFlow');
  }
  return path.join(os.homedir(), '.local', 'share', 'PraxisFlow');
}

export function resolveInstallHome(): string {
  return resolveInstallHomeFromEnv() ?? defaultOsInstallHome();
}

/** Docker Compose project name — isolates parallel test installs. */
export function resolveComposeProjectName(installHome: string): string {
  const fromEnv = process.env.COMPOSE_PROJECT_NAME?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const base = path
    .basename(installHome)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!base || base === 'praxisflow') {
    return 'praxis-flow';
  }
  return `pf-${base}`;
}
