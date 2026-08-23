import type { SettingsSnapshotDbFromApp } from './settings-backup.js';

export function buildExpectedDbSnapshotAfterImport(
  settings: Record<string, unknown>,
  options: { skipProviderCredentials?: boolean } = {},
): SettingsSnapshotDbFromApp {
  const skipProviderCredentials = options.skipProviderCredentials === true;
  let messagingProviderConfigs = settings.messagingProviderConfigs;
  if (skipProviderCredentials && Array.isArray(messagingProviderConfigs)) {
    messagingProviderConfigs = messagingProviderConfigs.map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return entry;
      }
      const provider = entry as Record<string, unknown>;
      if (provider.providerId === 'mock') {
        return provider;
      }
      return {
        ...provider,
        enabled: false,
        credentialsJson: '{}',
      };
    });
  }

  return {
    settingsFormatVersion: settings.settingsFormatVersion as number,
    exportedAt: settings.exportedAt as string,
    opsSettings: settings.opsSettings,
    authSettings: settings.authSettings,
    messagingProviderConfigs,
  };
}
