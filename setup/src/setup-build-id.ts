import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SETUP_BUILD_ID_ENV } from '@praxis-flow/server-shared';

export function resolveSetupBuildId(moduleUrl = import.meta.url): string {
  const fromEnv = process.env[SETUP_BUILD_ID_ENV]?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const pkgPath = path.join(path.dirname(fileURLToPath(moduleUrl)), '..', 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: unknown };
    if (typeof pkg.version === 'string' && pkg.version.trim()) {
      return pkg.version.trim();
    }
  } catch {
    // fall through
  }

  return 'unknown';
}
