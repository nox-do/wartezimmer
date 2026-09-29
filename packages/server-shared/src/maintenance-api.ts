export const MAINTENANCE_API_PROTOCOL_VERSION = 1 as const;
export const MAINTENANCE_API_INFO_PATH = '/api/v1/ops/maintenance/info' as const;

export type MaintenanceApiInfo = {
  protocolVersion: number;
  stackVersion: string | null;
  snapshotExportFormatVersion: number;
  snapshotImportFormatVersions: number[];
};

export function parseMaintenanceApiInfo(value: unknown): MaintenanceApiInfo | null {
  if (value === null || typeof value !== 'object') return null;
  const info = value as Record<string, unknown>;
  if (
    typeof info.protocolVersion !== 'number' ||
    !Number.isInteger(info.protocolVersion) ||
    (info.stackVersion !== null && typeof info.stackVersion !== 'string') ||
    typeof info.snapshotExportFormatVersion !== 'number' ||
    !Number.isInteger(info.snapshotExportFormatVersion) ||
    !Array.isArray(info.snapshotImportFormatVersions) ||
    !info.snapshotImportFormatVersions.every(
      (entry) => typeof entry === 'number' && Number.isInteger(entry),
    )
  ) {
    return null;
  }

  return {
    protocolVersion: info.protocolVersion,
    stackVersion: info.stackVersion,
    snapshotExportFormatVersion: info.snapshotExportFormatVersion,
    snapshotImportFormatVersions: [...info.snapshotImportFormatVersions],
  };
}
