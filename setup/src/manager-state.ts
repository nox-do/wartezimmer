import fs from 'node:fs';
import path from 'node:path';

export type ManagerReleaseState = {
  releaseVersion: string | null;
  appImage: string;
  sandboxImage: string;
  archiveSha256: string | null;
};

export type ManagerState = {
  release: ManagerReleaseState | null;
};

export const MANAGER_STATE_FILE = 'manager-state.json';

export function managerStatePath(installHome: string): string {
  return path.join(installHome, MANAGER_STATE_FILE);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeManagerState(raw: unknown): ManagerState {
  if (!raw || typeof raw !== 'object') {
    return { release: null };
  }

  const release = (raw as { release?: unknown }).release;
  if (!release || typeof release !== 'object') {
    return { release: null };
  }

  const candidate = release as Partial<ManagerReleaseState>;
  if (!isNonEmptyString(candidate.appImage) || !isNonEmptyString(candidate.sandboxImage)) {
    return { release: null };
  }

  return {
    release: {
      releaseVersion: isNonEmptyString(candidate.releaseVersion)
        ? candidate.releaseVersion.trim()
        : null,
      appImage: candidate.appImage.trim(),
      sandboxImage: candidate.sandboxImage.trim(),
      archiveSha256: isNonEmptyString(candidate.archiveSha256)
        ? candidate.archiveSha256.trim().toLowerCase()
        : null,
    },
  };
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
      archiveSha256: release.archiveSha256?.trim().toLowerCase() || null,
    },
  };

  fs.mkdirSync(installHome, { recursive: true });
  fs.writeFileSync(managerStatePath(installHome), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

export function releaseEnvFromManagerState(state: ManagerState): Record<string, string> {
  if (!state.release) {
    return {};
  }
  return {
    PRAXIS_FLOW_APP_IMAGE: state.release.appImage,
    PRAXIS_FLOW_SANDBOX_IMAGE: state.release.sandboxImage,
  };
}
