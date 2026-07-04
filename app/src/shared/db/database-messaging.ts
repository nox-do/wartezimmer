import type { StatementSync } from 'node:sqlite';
import { isRecord } from '../type-guards.js';
import {
  buildMessagingProviderCatalog,
  getMessagingProviderDefinition,
  isMessagingProviderId,
  type MessagingProviderId,
} from '../messaging/provider-registry.js';
import type { MessagingProviderCatalog } from './db-types.js';
import { domainError } from '../errors/domain-error.js';

type MessagingStatements = {
  listMessagingProviderConfigsStmt: StatementSync;
  getMessagingProviderConfigByIdStmt: StatementSync;
  upsertMessagingProviderConfigStmt: StatementSync;
};

type MessagingHelpers = {
  nowIso: () => string;
};

export type MessagingDeps = MessagingStatements & MessagingHelpers;

function parseCredentialMap(raw: string | undefined): Record<string, string> {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return {};
    }

    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') {
        result[key] = value.trim();
      }
    }
    return result;
  } catch {
    return {};
  }
}

const SEVEN_PROVIDER_IDS = ['seven', 'seven_whatsapp'] as const;

function syncSevenSharedApiKey(
  deps: MessagingDeps,
  providerId: string,
  apiKey: string | undefined,
  updatedAt: string,
): void {
  if (!apiKey?.trim() || !(SEVEN_PROVIDER_IDS as readonly string[]).includes(providerId)) {
    return;
  }

  const otherId = providerId === 'seven' ? 'seven_whatsapp' : 'seven';
  const otherDefinition = getMessagingProviderDefinition(otherId);
  const otherRow = deps.getMessagingProviderConfigByIdStmt.get(otherId) as
    | { enabled?: number; credentialsJson?: string }
    | undefined;
  const otherCredentials = parseCredentialMap(otherRow?.credentialsJson);
  if (otherCredentials.apiKey === apiKey.trim()) {
    return;
  }

  deps.upsertMessagingProviderConfigStmt.run(
    otherId,
    otherDefinition.channel,
    otherRow?.enabled == null ? (otherDefinition.defaultEnabled ? 1 : 0) : otherRow.enabled,
    JSON.stringify({ ...otherCredentials, apiKey: apiKey.trim() }),
    updatedAt,
  );
}

function normalizeCredentialPatch(credentials: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(credentials)) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        normalized[key] = trimmed;
      }
    }
  }
  return normalized;
}

export function getMessagingProviderCatalogFromDb(deps: MessagingDeps): MessagingProviderCatalog {
  const rows = deps.listMessagingProviderConfigsStmt.all() as Array<{
    providerId?: string;
    enabled?: number;
    credentialsJson?: string;
  }>;

  const stateByProviderId: Partial<
    Record<MessagingProviderId, { enabled: boolean; credentials: Record<string, string> }>
  > = {};
  for (const row of rows) {
    if (!row.providerId || !isMessagingProviderId(row.providerId)) {
      continue;
    }

    stateByProviderId[row.providerId] = {
      enabled: row.enabled === 1,
      credentials: parseCredentialMap(row.credentialsJson),
    };
  }

  return buildMessagingProviderCatalog(stateByProviderId);
}

export function updateMessagingProviderConfigInDb(
  deps: MessagingDeps,
  providerId: string,
  patch: {
    enabled?: boolean;
    credentials?: Record<string, unknown>;
  },
): MessagingProviderCatalog['channels'][number]['providers'][number] {
  if (!isMessagingProviderId(providerId)) {
    throw domainError('UNKNOWN_MESSAGING_PROVIDER');
  }

  const definition = getMessagingProviderDefinition(providerId);
  const current = deps.getMessagingProviderConfigByIdStmt.get(providerId) as
    | { enabled?: number; credentialsJson?: string }
    | undefined;

  const currentCredentials = parseCredentialMap(current?.credentialsJson);
  const nextCredentials =
    patch.credentials == null
      ? currentCredentials
      : {
          ...currentCredentials,
          ...normalizeCredentialPatch(patch.credentials),
        };
  const nextEnabled =
    patch.enabled ?? (current?.enabled == null ? definition.defaultEnabled : current.enabled === 1);
  const updatedAt = deps.nowIso();

  deps.upsertMessagingProviderConfigStmt.run(
    providerId,
    definition.channel,
    nextEnabled ? 1 : 0,
    JSON.stringify(nextCredentials),
    updatedAt,
  );

  syncSevenSharedApiKey(deps, providerId, nextCredentials.apiKey, updatedAt);

  const catalog = getMessagingProviderCatalogFromDb(deps);
  const provider = catalog.channels
    .flatMap((channel) => channel.providers)
    .find((item) => item.id === providerId);
  if (!provider) {
    throw domainError('UNKNOWN_MESSAGING_PROVIDER');
  }
  return provider;
}

export function getMessagingProviderRuntimeConfigFromDb(
  deps: MessagingDeps,
  providerId: string,
): {
  providerId: string;
  enabled: boolean;
  credentials: Record<string, string>;
} {
  if (!isMessagingProviderId(providerId)) {
    throw domainError('UNKNOWN_MESSAGING_PROVIDER');
  }

  const definition = getMessagingProviderDefinition(providerId);
  const row = deps.getMessagingProviderConfigByIdStmt.get(providerId) as
    | { enabled?: number; credentialsJson?: string }
    | undefined;
  return {
    providerId,
    enabled: row?.enabled == null ? definition.defaultEnabled : row.enabled === 1,
    credentials: parseCredentialMap(row?.credentialsJson),
  };
}
