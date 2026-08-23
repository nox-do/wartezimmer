export type SettingsDbSnapshotRestoreContent = {
  opsSettings: unknown;
  authSettings: unknown;
  messagingProviderConfigs: unknown;
};

export function settingsDbSnapshotsEquivalentForRestore(
  left: SettingsDbSnapshotRestoreContent,
  right: SettingsDbSnapshotRestoreContent,
): boolean {
  return (
    JSON.stringify(left.opsSettings) === JSON.stringify(right.opsSettings) &&
    JSON.stringify(left.authSettings) === JSON.stringify(right.authSettings) &&
    JSON.stringify(left.messagingProviderConfigs) === JSON.stringify(right.messagingProviderConfigs)
  );
}
