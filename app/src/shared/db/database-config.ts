export function configuredExportBasePath(): string | null {
  const trimmed = process.env.EXPORT_BASE_PATH?.trim();
  return trimmed || null;
}
