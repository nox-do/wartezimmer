import fs from 'node:fs';
import path from 'node:path';
import {
  normalizeManagerState as normalizeManagerStateShared,
  validateManagerStateForBackup,
  type ManagerReleaseState,
  type ManagerState,
} from '@praxis-flow/server-shared';

export type { ManagerReleaseState, ManagerState };

export const MANAGER_STATE_FILE = 'manager-state.json';

export function managerStatePath(installHome: string): string {
  return path.join(installHome, MANAGER_STATE_FILE);
}

function normalizeManagerState(raw: unknown): ManagerState {
  return normalizeManagerStateShared(raw);
}

export function readManagerStateForBackup(installHome: string): ManagerState {
  const statePath = managerStatePath(installHome);
  if (!fs.existsSync(statePath)) {
    return { release: null };
  }

  const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8')) as unknown;
  const validation = validateManagerStateForBackup(parsed);
  if (!validation.ok) {
    throw new Error(validation.errors.join(' '));
  }
  return validation.state ?? { release: null };
}

export function readManagerState(installHome: string): ManagerState {
  const statePath = managerStatePath(installHome);
  if (!fs.existsSync(statePath)) {
    return { release: null };
  }

  try {
    return normalizeManagerState(JSON.parse(fs.readFileSync(statePath, 'utf8')));
  } catch {
    return { release: null };
  }
}

export function writeManagerStateAtomically(installHome: string, state: ManagerState): void {
  const statePath = managerStatePath(installHome);
  const tempPath = `${statePath}.tmp-${process.pid}-${Date.now()}`;
  fs.mkdirSync(installHome, { recursive: true });
  fs.writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, statePath);
}

export function writeManagerReleaseState(
  installHome: string,
  release: ManagerReleaseState,
): ManagerState {
  const state = readManagerState(installHome);
  const next: ManagerState = {
    ...state,
    release: {
      releaseVersion: release.releaseVersion?.trim() || null,
      appImage: release.appImage.trim(),
      sandboxImage: release.sandboxImage.trim(),
      gatewayImage: release.gatewayImage?.trim() || null,
      archiveSha256: release.archiveSha256?.trim().toLowerCase() || null,
    },
  };

  writeManagerStateAtomically(installHome, next);
  return next;
}

export function releaseEnvFromManagerState(state: ManagerState): Record<string, string> {
  if (!state.release) {
    return {};
  }
  return {
    PRAXIS_FLOW_APP_IMAGE: state.release.appImage,
    PRAXIS_FLOW_SANDBOX_IMAGE: state.release.sandboxImage,
    ...(state.release.gatewayImage
      ? { PRAXIS_FLOW_GATEWAY_IMAGE: state.release.gatewayImage }
      : {}),
  };
}
