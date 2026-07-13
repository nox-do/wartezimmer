import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  PfupdateInspectCompatibility,
  PfupdateInspectResult,
  PfupdateManifestV1,
} from '@praxis-flow/server-shared';
import { readManagerState } from './manager-state.js';
import { extractPfupdateArchive, validateExtractedPfupdate } from './pfupdate-package.js';
import { resolveCurrentSettingsFormatVersion } from './settings-format-version.js';
import type { SetupContext } from './setup-context.js';

export type PfupdateInspectInput = {
  archivePath: string;
  managerVersion?: string | null;
  settingsFormatVersion?: number | null;
};

export type PfupdateInspectDeps = {
  extractArchive?: typeof extractPfupdateArchive;
  validatePackage?: typeof validateExtractedPfupdate;
  resolveSettingsFormatVersion?: typeof resolveCurrentSettingsFormatVersion;
};

function inspectStagingDirectory(home: string, inspectId: string): string {
  return path.join(home, '.pfupdate-inspect', inspectId);
}

function cleanupInspectStaging(stagingDir: string): void {
  const inspectRoot = path.dirname(stagingDir);
  if (fs.existsSync(inspectRoot)) {
    fs.rmSync(inspectRoot, { recursive: true, force: true });
  }
}

function emptyCompatibility(): PfupdateInspectCompatibility {
  return {
    packageValid: false,
    managerCompatible: false,
    settingsCompatible: false,
    updateSupported: false,
    warnings: [],
  };
}

function buildPackageSummary(manifest: PfupdateManifestV1) {
  return {
    releaseVersion: manifest.releaseVersion,
    minimumManagerVersion: manifest.minimumManagerVersion,
    supportedSettingsFormatVersions: manifest.supportedSettingsFormatVersions,
    targetSchemaVersion: manifest.targetSchemaVersion,
    images: manifest.images,
  };
}

export async function inspectPfupdate(
  input: PfupdateInspectInput,
  ctx: SetupContext,
  deps: PfupdateInspectDeps = {},
): Promise<PfupdateInspectResult> {
  const archivePath = input.archivePath.trim();
  const inspectId = randomBytes(8).toString('hex');
  const stagingDir = inspectStagingDirectory(ctx.home, inspectId);
  const currentReleaseVersion = readManagerState(ctx.home).release?.releaseVersion ?? null;

  const extractArchive = deps.extractArchive ?? extractPfupdateArchive;
  const validatePackage = deps.validatePackage ?? validateExtractedPfupdate;
  const resolveSettingsFormatVersion =
    deps.resolveSettingsFormatVersion ?? resolveCurrentSettingsFormatVersion;

  try {
    extractArchive(archivePath, stagingDir);

    const settingsFormatVersion =
      input.settingsFormatVersion ?? (await resolveSettingsFormatVersion());

    const validation = validatePackage(stagingDir, {
      managerVersion: input.managerVersion ?? undefined,
      settingsFormatVersion,
    });

    if (!validation.ok || !validation.manifest) {
      const compatibility = validation.compatibility ?? emptyCompatibility();
      return {
        ok: false,
        currentReleaseVersion,
        compatibility: {
          ...compatibility,
          updateSupported: false,
        },
        errors: validation.errors.length > 0 ? validation.errors : ['Update-Paket ist ungültig.'],
      };
    }

    const compatibility = validation.compatibility ?? emptyCompatibility();
    const updateSupported =
      compatibility.packageValid &&
      compatibility.managerCompatible &&
      compatibility.settingsCompatible;

    return {
      ok: updateSupported,
      package: buildPackageSummary(validation.manifest),
      currentReleaseVersion,
      compatibility: {
        ...compatibility,
        updateSupported,
      },
      errors: updateSupported || validation.errors.length === 0 ? undefined : validation.errors,
    };
  } catch (error) {
    return {
      ok: false,
      currentReleaseVersion,
      compatibility: emptyCompatibility(),
      errors: [
        error instanceof Error ? error.message : 'Update-Paket konnte nicht geprüft werden.',
      ],
    };
  } finally {
    cleanupInspectStaging(stagingDir);
  }
}
