export type MessagingChannelId = 'sms' | 'messenger';
export type MessagingProviderConfigState = {
  enabled: boolean;
  credentials: Record<string, string>;
};

export type MessagingProviderDescriptor = {
  id: string;
  label: string;
  channel: MessagingChannelId;
  configured: boolean;
  enabled: boolean;
  requires: string[];
};

export type MessagingProviderCatalog = {
  channels: Array<{
    id: MessagingChannelId;
    providers: MessagingProviderDescriptor[];
  }>;
};

export const MESSAGING_PROVIDER_IDS = ['mock', 'seven', 'seven_whatsapp'] as const;
export type MessagingProviderId = (typeof MESSAGING_PROVIDER_IDS)[number];

type MessagingProviderDefinition = {
  id: MessagingProviderId;
  label: string;
  channel: MessagingChannelId;
  defaultEnabled: boolean;
  requires: string[];
};

const MESSAGING_PROVIDER_DEFINITIONS: MessagingProviderDefinition[] = [
  {
    id: 'mock',
    label: 'Mock SMS',
    channel: 'sms',
    defaultEnabled: true,
    requires: [],
  },
  {
    id: 'seven',
    label: 'seven.io SMS',
    channel: 'sms',
    defaultEnabled: false,
    requires: ['apiKey'],
  },
  {
    id: 'seven_whatsapp',
    label: 'seven.io WhatsApp',
    channel: 'messenger',
    defaultEnabled: false,
    requires: ['apiKey', 'from', 'template'],
  },
];

export function isMessagingProviderId(value: string): value is MessagingProviderId {
  return (MESSAGING_PROVIDER_IDS as readonly string[]).includes(value);
}

export function getMessagingProviderDefinition(
  providerId: MessagingProviderId,
): MessagingProviderDefinition {
  const definition = MESSAGING_PROVIDER_DEFINITIONS.find((item) => item.id === providerId);
  if (!definition) {
    throw new Error(`UNKNOWN_MESSAGING_PROVIDER:${providerId}`);
  }
  return definition;
}

export function buildMessagingProviderCatalog(
  configByProviderId: Partial<Record<MessagingProviderId, MessagingProviderConfigState>>,
): MessagingProviderCatalog {
  const sharedSevenApiKey = configByProviderId.seven?.credentials?.apiKey?.trim() ?? '';

  const mapProvider = (provider: MessagingProviderDefinition) => {
    const state = configByProviderId[provider.id];
    const credentials = state?.credentials ?? {};
    const configured = provider.requires.every((key) => {
      if (key === 'apiKey' && provider.id === 'seven_whatsapp' && sharedSevenApiKey.length > 0) {
        return true;
      }
      return (credentials[key]?.trim().length ?? 0) > 0;
    });
    const enabled = (state?.enabled ?? provider.defaultEnabled) && configured;

    return {
      id: provider.id,
      label: provider.label,
      channel: provider.channel,
      configured,
      enabled,
      requires: provider.requires,
    };
  };

  const smsProviders = MESSAGING_PROVIDER_DEFINITIONS.filter(
    (provider) => provider.channel === 'sms',
  ).map(mapProvider);
  const messengerProviders = MESSAGING_PROVIDER_DEFINITIONS.filter(
    (provider) => provider.channel === 'messenger',
  ).map(mapProvider);

  return {
    channels: [
      {
        id: 'sms',
        providers: smsProviders,
      },
      {
        id: 'messenger',
        providers: messengerProviders,
      },
    ],
  };
}
