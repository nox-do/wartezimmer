import fs from 'node:fs';
import path from 'node:path';
import {
  parsePfbackupArchive,
  STACK_IMAGE_ENV_KEYS,
  tlsBackupMetadataConsistent,
  tlsInBackup,
  tlsPreparedInBackup,
  tlsRestoreBlockedCopy,
  tlsRestoreSupported,
  tlsRestoreWarningCopy,
  tlsSidecarMatches,
  validateManagerStateForBackup,
  type ManagerReleaseState,
  type ManagerState,
  type PfbackupInspectBackupSummary,
  type PfbackupInspectCompatibility,
  type PfbackupInspectEnvironment,
  type PfbackupInspectResult,
  type PfbackupTlsInspectSummary,
  type StackImageEnvKey,
  type TlsState,
} from '@praxis-flow/server-shared';
import { inspectTlsSidecarIdentity } from './tls-backup-sidecar.js';
import { readEnvMap } from './env-file.js';
import { readManagerState } from './manager-state.js';
import type { SetupContext } from './setup-context.js';
import { LOCAL_MAINTENANCE_APP_BASE_URL } from './urls.js';
import { validatePfbackupContent, validateSettingsSnapshotWithApp } from './settings-backup.js';
import { maintenanceRequestHeaders } from './maintenance-auth.js';

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

const STACK_IMAGE_MANAGER_FIELDS = {
  PRAXIS_FLOW_APP_IMAGE: 'appImage',
  PRAXIS_FLOW_SANDBOX_IMAGE: 'sandboxImage',
  PRAXIS_FLOW_GATEWAY_IMAGE: 'gatewayImage',
} as const satisfies Record<
  Exclude<StackImageEnvKey, 'PRAXIS_FLOW_PROXY_IMAGE'>,
  keyof Pick<ManagerReleaseState, 'appImage' | 'sandboxImage' | 'gatewayImage'>
>;

type StackImageManagerEnvKey = keyof typeof STACK_IMAGE_MANAGER_FIELDS;

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
    proxyImage: env.PRAXIS_FLOW_PROXY_IMAGE,
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
  for (const envKey of Object.keys(STACK_IMAGE_MANAGER_FIELDS) as StackImageManagerEnvKey[]) {
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
      { headers: maintenanceRequestHeaders(), signal: AbortSignal.timeout(5_000) },
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

const TLS_STATES = new Set<TlsState>([
  'off',
  'preparing',
  'awaiting-operator-dns',
  'dns-verified',
  'obtaining-certificate',
  'active',
  'degraded',
  'error',
]);

function readTlsState(raw: unknown): TlsState {
  const value = String(raw ?? 'off').trim();
  return TLS_STATES.has(value as TlsState) ? (value as TlsState) : 'off';
}

export function buildPfbackupTlsInspectSummary(
  backupEnv: Record<string, string>,
  tlsSidecarBase64?: string,
): PfbackupTlsInspectSummary | undefined {
  const tlsStateRaw = backupEnv.TLS_STATE?.trim() || 'off';
  const tlsClaimsHttps = tlsInBackup({
    canonicalBaseUrl: backupEnv.CANONICAL_BASE_URL,
    proxyMode: backupEnv.PROXY_MODE,
  });
  const preparedInBackup = tlsPreparedInBackup({
    tlsState: tlsStateRaw,
    tlsClaimsHttps,
  });
  if (tlsStateRaw === 'off' && !tlsClaimsHttps && !preparedInBackup) {
    return undefined;
  }

  const sidecar = inspectTlsSidecarIdentity(tlsSidecarBase64);
  const sidecarMatches = tlsSidecarMatches({
    backupInstallId: backupEnv.TLS_INSTALLATION_ID,
    backupHostname: backupEnv.TLS_HOSTNAME,
    backupInstallationDomain: backupEnv.TLS_INSTALLATION_DOMAIN,
    backupStaffHostname: backupEnv.TLS_STAFF_HOSTNAME,
    backupPortalHostname: backupEnv.TLS_PORTAL_HOSTNAME,
    backupWildcardCertificateName: backupEnv.TLS_WILDCARD_CERTIFICATE_NAME,
    sidecarInstallId: sidecar.installationId,
    sidecarHostname: sidecar.hostname,
    sidecarInstallationDomain: sidecar.installationDomain,
    sidecarStaffHostname: sidecar.staffHostname,
    sidecarPortalHostname: sidecar.portalHostname,
    sidecarWildcardCertificateName: sidecar.wildcardCertificateName,
  });
  const metadataConsistent = tlsBackupMetadataConsistent({
    tlsState: tlsStateRaw,
    tlsClaimsHttps,
  });

  return {
    state: readTlsState(tlsStateRaw),
    inBackup: tlsClaimsHttps,
    preparedInBackup,
    sidecarPresent: sidecar.present,
    sidecarMatches,
    metadataConsistent,
  };
}

/**
 * Read Canonical/PROXY_MODE/TLS_STATE from backup env and populate backup.tls.
 * Active HTTPS requires a matching sidecar (bytes from Main, never a host path).
 * restoreSupported adds that gate to archiveValid, settingsValid and
 * targetAppReachable; it must not replace today's compatibility gates.
 * Contradictory active/degraded state vs HTTP env blocks. Prepare-only TLS without
 * a matching sidecar is a warning, not a block; restore resets that preparation to off.
 * Helpers: packages/server-shared tls-backup.ts (from tls-model.js).
 */
export async function inspectPfbackup(
  content: string,
  ctx: SetupContext,
  deps: PfbackupInspectDeps = {},
  options: { tlsSidecarBase64?: string } = {},
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

  const tls = buildPfbackupTlsInspectSummary(backupEnv, options.tlsSidecarBase64);
  if (tls) {
    backup.tls = tls;
    const tlsWarning = tlsRestoreWarningCopy({
      tlsMetadataConsistent: tls.metadataConsistent,
      tlsPrepared: tls.preparedInBackup,
      sidecarPresent: tls.sidecarPresent,
      sidecarMatches: tls.sidecarMatches,
    });
    if (tlsWarning) {
      warnings.push(tlsWarning);
    }
  }

  const restoreSupported = tlsRestoreSupported({
    archiveValid: true,
    settingsValid,
    targetAppReachable,
    tlsMetadataConsistent: tls?.metadataConsistent ?? true,
    tlsClaimsHttps: tls?.inBackup ?? false,
    sidecarPresent: tls?.sidecarPresent ?? false,
    sidecarMatches: tls?.sidecarMatches ?? false,
  });

  const compatibility: PfbackupInspectCompatibility = {
    archiveValid: true,
    settingsValid,
    targetAppReachable,
    restoreSupported,
    warnings,
  };

  const tlsBlock = tls
    ? tlsRestoreBlockedCopy({
        tlsMetadataConsistent: tls.metadataConsistent,
        tlsClaimsHttps: tls.inBackup,
        sidecarPresent: tls.sidecarPresent,
        sidecarMatches: tls.sidecarMatches,
      })
    : null;
  const errors = restoreSupported
    ? undefined
    : tlsBlock
      ? [tlsBlock]
      : settingsValidation.errors.length
        ? settingsValidation.errors
        : archiveResult.errors;

  return {
    ok: restoreSupported,
    backup,
    environment,
    compatibility,
    ...(errors ? { errors } : {}),
  };
}
