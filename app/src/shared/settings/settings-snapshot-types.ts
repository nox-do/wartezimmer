export const SETTINGS_FORMAT_VERSION = 1 as const;

export type SettingsSnapshotV1 = {
  settingsFormatVersion: typeof SETTINGS_FORMAT_VERSION;
  exportedAt: string;
  opsSettings: OpsSettingsSnapshotV1;
  authSettings: AuthSettingsSnapshotV1;
  messagingProviderConfigs: MessagingProviderConfigSnapshotV1[];
  env: Record<string, string>;
};

/** DB-only export from the app — host `.env` is merged by Setup when building `.pfbackup`. */
export type SettingsSnapshotDbV1 = Omit<SettingsSnapshotV1, 'env'>;

export type OpsSettingsSnapshotV1 = {
  routingMode: 'simple' | 'complex';
  /** Optional for backwards-compatible import of v1 snapshots created before this setting. */
  postWaitingCallTargetId?: string | null;
  returnWindowMinutes: number;
  practiceOpenFrom: string;
  practiceOpenTo: string;
  practiceProfileJson: string;
  topics: unknown;
  journeySettings: unknown;
  rooms: unknown;
  contactLookupFolderPath: string | null;
  contactLookupDelimiterMode: 'auto' | 'semicolon' | 'comma' | 'tab';
  contactLookupHasHeader: boolean;
  contactLookupMappingJson: string;
  emergencyEnabled: boolean;
  terminalWlanPromoEnabled: boolean;
  terminalAuthPhoneEnabled: boolean;
  terminalAuthNameDobEnabled: boolean;
  terminalAuthEgkEnabled: boolean;
  terminalPatientLocales: unknown;
  smsProvider: string;
  exportBasePath: string;
  portalEnabled: boolean;
  setupCompletedAt: string | null;
  setupContactMode: 'unset' | 'sample' | 'own';
};

export type AuthSettingsSnapshotV1 = {
  staffPinHashMfa: string;
  staffPinHashOps: string;
  roomPanelPinHash: string;
};

export type MessagingProviderConfigSnapshotV1 = {
  providerId: string;
  channel: 'sms' | 'messenger';
  enabled: boolean;
  credentialsJson: string;
};

export type SettingsSnapshotImportOptions = {
  skipProviderCredentials?: boolean;
  /** @internal */
  testHooks?: {
    afterOpsSettingsWrite?: () => void;
    beforeCatalogSync?: () => void;
  };
};

export type SettingsSnapshotImportReport = {
  ok: true;
  settingsFormatVersion: typeof SETTINGS_FORMAT_VERSION;
  exportedAt: string;
  routingMode: OpsSettingsSnapshotV1['routingMode'];
  portalEnabled: boolean;
  setupContactMode: OpsSettingsSnapshotV1['setupContactMode'];
  messagingProviderCount: number;
  catalogIntegrityOk: true;
  skipProviderCredentials: boolean;
  providerCredentialsSkipped: boolean;
  disabledProviderIds: string[];
};

export class SettingsSnapshotError extends Error {
  constructor(
    readonly code:
      | 'UNKNOWN_FORMAT_VERSION'
      | 'INVALID_SNAPSHOT'
      | 'OPS_SETTINGS_INVALID'
      | 'CATALOG_INTEGRITY_FAILED'
      | 'IMPORT_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'SettingsSnapshotError';
  }
}

export type SettingsSnapshotImportErrorResponse = {
  ok: false;
  code: SettingsSnapshotError['code'];
  errors: string[];
};
