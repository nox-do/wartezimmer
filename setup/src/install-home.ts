import { assertWindowsHostPath } from './windows-host-path.js';
import os from 'node:os';
import path from 'node:path';

/** Override for dev/test installs (e.g. `/tmp/pf-dev-001`). */
export function resolveInstallHomeFromEnv(): string | null {
  const raw = process.env.WARTEZIMMER_HOME?.trim();
  if (raw) assertWindowsHostPath(raw);
  return raw ? path.resolve(raw) : null;
}

/** Delivery default when not in the monorepo and `WARTEZIMMER_HOME` is unset. */
export function defaultOsInstallHome(): string {
  if (process.platform === 'win32') {
    return path.join(
      process.env.LOCALAPPDATA?.trim() || path.join(os.homedir(), 'AppData', 'Local'),
      'Wartezimmer',
    );
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Wartezimmer');
  }
  return path.join(os.homedir(), '.local', 'share', 'Wartezimmer');
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

  if (!base || base === 'wartezimmer') {
    return 'wartezimmer';
  }
  return `wz-${base}`;
}
