export function defaultUserFolderLabel(kind: 'imports' | 'exports'): string {
  return kind === 'imports' ? '~/wartezimmer-imports' : '~/wartezimmer-exports';
}

export function resolveUserFolderLabel(
  envKey: 'IMPORTS_HOST_PATH' | 'EXPORTS_HOST_PATH',
  kind: 'imports' | 'exports',
): string {
  const configured = process.env[envKey]?.trim();
  return configured && configured.length > 0 ? configured : defaultUserFolderLabel(kind);
}
