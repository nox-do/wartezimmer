import fs from 'node:fs';
import path from 'node:path';
import type { HostLifecycle } from '@wartezimmer/server-shared/setup-api';
import { parseEnvMap } from './env-file.js';
import { deriveHostLifecycle, type HostLifecycleFacts } from './host-lifecycle.js';
import { readRestrictedOperation } from './restricted-operation.js';
import { runDockerCommand } from './docker-cli.js';
import type { SetupContext } from './setup-context.js';

/** Capture local files synchronously so a same-process commit cannot interleave. */
export function readHostLifecycle(
  home: string,
  env: Map<string, string>,
  envExists: boolean,
  residues: HostLifecycleFacts['residues'] = 'unknown',
): HostLifecycle {
  try {
    const journal = readRestrictedOperation(home);
    const localResidues = ['state/tls', 'state/restricted-recovery.json'].some((name) => {
      const file = path.join(home, name);
      return (
        fs.existsSync(file) && (!fs.statSync(file).isDirectory() || fs.readdirSync(file).length > 0)
      );
    });
    return deriveHostLifecycle({
      env,
      envExists,
      residues: localResidues ? 'present' : residues,
      operation: journal
        ? journal.action === 'pending-apply'
          ? 'portal-apply'
          : 'portal-remove'
        : 'none',
      previousEnv: journal ? parseEnvMap(journal.previousEnv) : undefined,
      recovered: fs.existsSync(path.join(home, 'state/restricted-recovery.json')),
    });
  } catch {
    return {
      assessment: 'unknown',
      mode: null,
      preparation: 'none',
      operation: 'unreadable',
      recovery: 'none',
      issues: [
        {
          code: 'lifecycle-unreadable',
          message:
            'Die gespeicherte Einrichtung oder eine offene Portaländerung kann nicht gelesen werden.',
        },
      ],
    };
  }
}

/** Only for missing .env: do not mistake leftover project resources for a fresh install. */
export async function inspectLifecycleResidues(
  ctx: SetupContext,
  dockerAvailable: boolean,
): Promise<HostLifecycleFacts['residues']> {
  if (!dockerAvailable) return 'unknown';
  try {
    const filter = `label=com.docker.compose.project=${ctx.composeProjectName}`;
    const results = await Promise.all([
      runDockerCommand(['ps', '-aq', '--filter', filter]),
      runDockerCommand(['volume', 'ls', '-q', '--filter', filter]),
    ]);
    if (results.some((result) => result.code === 0 && result.stdout.trim())) return 'present';
    return results.every((result) => result.code === 0) ? 'none' : 'unknown';
  } catch {
    return 'unknown';
  }
}
