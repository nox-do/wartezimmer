import fs from 'node:fs';
import path from 'node:path';
import {
  parsePfbackupArchive,
  STACK_IMAGE_ENV_KEYS,
  validateManagerStateForBackup,
  type ManagerReleaseState,
  type ManagerState,
  type PfbackupInspectBackupSummary,
  type PfbackupInspectCompatibility,
  type PfbackupInspectEnvironment,
  type PfbackupInspectResult,
  type StackImageEnvKey,
} from '@praxis-flow/server-shared';
import { readEnvMap } from './env-file.js';
import { readManagerState } from './manager-state.js';
import type { SetupContext } from './setup-context.js';
import { LOCAL_MAINTENANCE_APP_BASE_URL } from './urls.js';
import { validatePfbackupContent, validateSettingsSnapshotWithApp } from './settings-backup.js';

const HOST_PATH_ENV_KEYS = [
  'IMPORTS_HOST_PATH',
  'EXPORTS_HOST_PATH',
  'CONTACT_LOOKUP_BASE_PATH',
] as const;

const NETWORK_ENV_KEYS = [
  'SETUP_LAN_APP_IP',
  'CANONICAL_BASE_URL',
  'PORTAL_FQDN',
  'GATEWAY_IP',
  'GATEWAY_INTERFACE',
  'OPENNDS_FASKEY',
  'OPENNDS_GATEWAYNAME',
  'AUTH_BRIDGE_URL',
] as const;

const MOCK_MESSAGING_PROVIDER_ID = 'mock';

const STACK_IMAGE_MANAGER_FIELDS: Record<
  StackImageEnvKey,
  keyof Pick<ManagerReleaseState, 'appImage' | 'sandboxImage' | 'gatewayImage'>
> = {
  PRAXIS_FLOW_APP_IMAGE: 'appImage',
  PRAXIS_FLOW_SANDBOX_IMAGE: 'sandboxImage',
  PRAXIS_FLOW_GATEWAY_IMAGE: 'gatewayImage',
};

export type PfbackupInspectDeps = {
  validateSettingsSnapshot?: typeof validateSettingsSnapshotWithApp;
  checkTargetAppReachable?: (localAppBaseUrl: string) => Promise<boolean>;
};

function pickNonEmptyStrings(source: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    const trimmed = value?.trim();
    if (trimmed) {
      out[key] = trimmed;
    }
  }
  return out;
}

function readOpsSettingsRecord(settings: Record<string, unknown>): Record<string, unknown> | null {
  const opsSettings = settings.opsSettings;
  return opsSettings && typeof opsSettings === 'object' && !Array.isArray(opsSettings)
    ? (opsSettings as Record<string, unknown>)
    : null;
}

export function providerCredentialsIncludedInSnapshot(messagingProviderConfigs: unknown): boolean {
  if (!Array.isArray(messagingProviderConfigs)) {
    return false;
  }

  return messagingProviderConfigs.some((entry) => {
    if (!entry || typeof entry !== 'object') {
      return false;
    }
    const provider = entry as { providerId?: unknown; credentialsJson?: unknown };
    if (provider.providerId === MOCK_MESSAGING_PROVIDER_ID) {
      return false;
    }
    if (typeof provider.credentialsJson !== 'string') {
      return false;
    }
    const trimmed = provider.credentialsJson.trim();
    return trimmed.length > 0 && trimmed !== '{}';
  });
}

export function extractPfbackupInspectEnvironment(
  settings: Record<string, unknown>,
  managerState: ManagerState,
): PfbackupInspectEnvironment {
  const env =
    settings.env && typeof settings.env === 'object' && !Array.isArray(settings.env)
      ? (settings.env as Record<string, string>)
      : {};
  const opsSettings = readOpsSettingsRecord(settings);
  const release = managerState.release;

  const hostPaths = pickNonEmptyStrings(
    Object.fromEntries(
      HOST_PATH_ENV_KEYS.map((key) => [key, env[key]]).filter(([, value]) => Boolean(value)),
    ),
  );

  if (
    typeof opsSettings?.contactLookupFolderPath === 'string' &&
    opsSettings.contactLookupFolderPath.trim()
  ) {
    hostPaths.contactLookupFolderPath = opsSettings.contactLookupFolderPath.trim();
  }
  if (typeof opsSettings?.exportBasePath === 'string' && opsSettings.exportBasePath.trim()) {
    hostPaths.exportBasePath = opsSettings.exportBasePath.trim();
  }

  const network = pickNonEmptyStrings(
    Object.fromEntries([
      ...NETWORK_ENV_KEYS.map((key) => [key, env[key]] as const),
      ...Object.entries(env).filter(
        ([key]) => key.startsWith('GATEWAY_') || key.startsWith('OPENNDS_'),
      ),
    ]),
  );

  const imageReferences = pickNonEmptyStrings({
    releaseVersion: release?.releaseVersion ?? undefined,
    appImage: env.PRAXIS_FLOW_APP_IMAGE ?? release?.appImage,
    sandboxImage: env.PRAXIS_FLOW_SANDBOX_IMAGE ?? release?.sandboxImage,
    gatewayImage: env.PRAXIS_FLOW_GATEWAY_IMAGE ?? release?.gatewayImage ?? undefined,
    archiveSha256: release?.archiveSha256 ?? undefined,
  });

  return { hostPaths, network, imageReferences };
}

export function buildPfbackupInspectBackupSummary(
  settings: Record<string, unknown>,
  createdAt: string,
  settingsFormatVersion: number,
  managerState: ManagerState,
): PfbackupInspectBackupSummary {
  const opsSettings = readOpsSettingsRecord(settings);
  return {
    createdAt,
    settingsFormatVersion,
    releaseVersion: managerState.release?.releaseVersion ?? null,
    routingMode: typeof opsSettings?.routingMode === 'string' ? opsSettings.routingMode : null,
    portalEnabled: opsSettings?.portalEnabled === true,
    providerCredentialsIncluded: providerCredentialsIncludedInSnapshot(
      settings.messagingProviderConfigs,
    ),
  };
}

function buildStackImageConsistencyWarnings(
  backupEnv: Record<string, string>,
  backupRelease: ManagerReleaseState | null | undefined,
): string[] {
  if (!backupRelease) {
    return [];
  }

  const warnings: string[] = [];
  for (const envKey of STACK_IMAGE_ENV_KEYS) {
    const envValue = backupEnv[envKey]?.trim();
    const managerField = STACK_IMAGE_MANAGER_FIELDS[envKey];
    const managerValue = backupRelease[managerField]?.trim();
    if (!envValue || !managerValue) {
      continue;
    }
    if (envValue !== managerValue) {
      warnings.push(
        `settings.env (${envKey}) und manager-state.release.${managerField} stimmen nicht überein.`,
      );
    }
  }
  return warnings;
}

export function buildPfbackupInspectWarnings(input: {
  backupEnv: Record<string, string>;
  currentEnv: Record<string, string>;
  backupManagerState: ManagerState;
  currentManagerState: ManagerState;
}): string[] {
  const warnings = buildStackImageConsistencyWarnings(
    input.backupEnv,
    input.backupManagerState.release,
  );

  for (const key of HOST_PATH_ENV_KEYS) {
    const backupValue = input.backupEnv[key]?.trim();
    const currentValue = input.currentEnv[key]?.trim();
    if (backupValue && currentValue && backupValue !== currentValue) {
      warnings.push(`${key} weicht vom aktuellen Host ab (${currentValue} → ${backupValue}).`);
    }
    if (backupValue && !fs.existsSync(backupValue)) {
      warnings.push(`${key} im Backup verweist auf nicht vorhandenes Verzeichnis: ${backupValue}`);
    }
  }

  for (const envKey of STACK_IMAGE_ENV_KEYS) {
    const backupValue = input.backupEnv[envKey]?.trim();
    const currentValue = input.currentEnv[envKey]?.trim();
    if (backupValue && currentValue && backupValue !== currentValue) {
      warnings.push(`${envKey} weicht vom aktuellen Host ab (${currentValue} → ${backupValue}).`);
    }
  }

  const backupRelease = input.backupManagerState.release;
  const currentRelease = input.currentManagerState.release;
  if (
    backupRelease?.releaseVersion &&
    currentRelease?.releaseVersion &&
    backupRelease.releaseVersion !== currentRelease.releaseVersion
  ) {
    warnings.push(
      `Release-Version im Backup (${backupRelease.releaseVersion}) weicht von aktueller Installation (${currentRelease.releaseVersion}) ab.`,
    );
  }

  if (backupRelease && currentRelease) {
    if (
      backupRelease.appImage !== currentRelease.appImage ||
      backupRelease.sandboxImage !== currentRelease.sandboxImage ||
      (backupRelease.gatewayImage ?? null) !== (currentRelease.gatewayImage ?? null)
    ) {
      warnings.push(
        'Image-Referenzen im Backup unterscheiden sich von der aktuellen manager-state.json.',
      );
    }
  }

  return warnings;
}

export async function checkMaintenanceAppReachable(
  localAppBaseUrl: string = LOCAL_MAINTENANCE_APP_BASE_URL,
): Promise<boolean> {
  try {
    const response = await fetch(
      `${localAppBaseUrl.replace(/\/$/, '')}/api/v1/ops/settings/capabilities`,
      { signal: AbortSignal.timeout(5_000) },
    );
    return response.ok;
  } catch {
    return false;
  }
}

function hostEnvRecord(envPath: string): Record<string, string> {
  if (!fs.existsSync(envPath)) {
    return {};
  }
  return Object.fromEntries(readEnvMap(envPath).entries());
}

function emptyCompatibility(): PfbackupInspectCompatibility {
  return {
    archiveValid: false,
    settingsValid: false,
    targetAppReachable: false,
    restoreSupported: false,
    warnings: [],
  };
}

export async function inspectPfbackup(
  content: string,
  ctx: SetupContext,
  deps: PfbackupInspectDeps = {},
): Promise<PfbackupInspectResult> {
  const localAppBaseUrl = LOCAL_MAINTENANCE_APP_BASE_URL;
  const validateSettingsSnapshot = deps.validateSettingsSnapshot ?? validateSettingsSnapshotWithApp;
  const checkTargetAppReachable = deps.checkTargetAppReachable ?? checkMaintenanceAppReachable;

  const archiveResult = validatePfbackupContent(content);
  if (!archiveResult.archiveValid || !archiveResult.summary) {
    return {
      ok: false,
      compatibility: {
        ...emptyCompatibility(),
        archiveValid: false,
      },
      errors: archiveResult.errors,
    };
  }

  let settings: Record<string, unknown>;
  let managerState: ManagerState;
  try {
    const archive = parsePfbackupArchive(JSON.parse(content));
    settings = JSON.parse(archive.settingsJson) as Record<string, unknown>;
    const managerValidation = validateManagerStateForBackup(JSON.parse(archive.managerStateJson));
    if (!managerValidation.ok || !managerValidation.state) {
      return {
        ok: false,
        compatibility: {
          archiveValid: false,
          settingsValid: false,
          targetAppReachable: false,
          restoreSupported: false,
          warnings: [],
        },
        errors: managerValidation.errors,
      };
    }
    managerState = managerValidation.state;
  } catch (error) {
    return {
      ok: false,
      compatibility: emptyCompatibility(),
      errors: [
        error instanceof Error ? error.message : 'Backup-Archiv konnte nicht gelesen werden.',
      ],
    };
  }

  const backup = buildPfbackupInspectBackupSummary(
    settings,
    archiveResult.summary.createdAt,
    archiveResult.summary.settingsFormatVersion,
    managerState,
  );
  const environment = extractPfbackupInspectEnvironment(settings, managerState);

  const backupEnv =
    settings.env && typeof settings.env === 'object' && !Array.isArray(settings.env)
      ? (settings.env as Record<string, string>)
      : {};
  const currentEnv = hostEnvRecord(path.join(ctx.home, '.env'));
  const currentManagerState = readManagerState(ctx.home);
  const warnings = buildPfbackupInspectWarnings({
    backupEnv,
    currentEnv,
    backupManagerState: managerState,
    currentManagerState,
  });

  const targetAppReachable = await checkTargetAppReachable(localAppBaseUrl);
  const settingsValidation = targetAppReachable
    ? await validateSettingsSnapshot(settings, localAppBaseUrl)
    : { ok: false, errors: ['Maintenance-API nicht erreichbar.'] };
  const settingsValid = settingsValidation.ok;

  if (!targetAppReachable) {
    warnings.push(
      'Praxis Flow Maintenance-API (Port 8082) ist nicht erreichbar — fachliche Validierung nicht möglich.',
    );
  } else if (!settingsValid) {
    warnings.push(...settingsValidation.errors);
  }

  const compatibility: PfbackupInspectCompatibility = {
    archiveValid: true,
    settingsValid,
    targetAppReachable,
    restoreSupported: settingsValid && targetAppReachable,
    warnings,
  };

  return {
    ok: compatibility.restoreSupported,
    backup,
    environment,
    compatibility,
    ...(compatibility.restoreSupported
      ? {}
      : {
          errors: settingsValidation.errors.length
            ? settingsValidation.errors
            : archiveResult.errors,
        }),
  };
}
