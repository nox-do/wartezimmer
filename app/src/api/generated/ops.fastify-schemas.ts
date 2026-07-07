/**
 * AUTO-GENERATED from openapi/ops.yaml — do not edit.
 * Run: npm run generate:api-schemas
 */

export const OpsStateResponse = {
  type: 'object',
  required: ['checkinLocked', 'dayClosePhase', 'updatedAt'],
  properties: {
    checkinLocked: {
      type: 'boolean',
    },
    dayClosePhase: {
      type: 'string',
      enum: ['open', 'started'],
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const BusinessDayResetResponse = {
  type: 'object',
  required: [
    'dayClosePhase',
    'resetVisitCount',
    'updatedAt',
    'lastResetBusinessDay',
    'sandboxRestartRequired',
    'sandboxRestartInitiated',
  ],
  properties: {
    dayClosePhase: {
      type: 'string',
      enum: ['open', 'started'],
    },
    resetVisitCount: {
      type: 'integer',
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
    lastResetBusinessDay: {
      type: 'string',
    },
    sandboxRestartRequired: {
      type: 'boolean',
      const: true,
    },
    sandboxRestartInitiated: {
      type: 'boolean',
      const: true,
    },
  },
} as const;

export const BusinessDayResetRequest = {
  type: 'object',
  required: ['confirmBusinessDayReset'],
  additionalProperties: false,
  properties: {
    confirmBusinessDayReset: {
      type: 'boolean',
      const: true,
    },
  },
} as const;

export const RuntimeResetPreviewResponse = {
  type: 'object',
  required: [
    'ticketCount',
    'outboxEventCount',
    'emergencyActive',
    'preservedTopicCount',
    'preservedRoomCount',
    'confirmPhrase',
    'serverTime',
  ],
  properties: {
    visitCount: {
      type: 'integer',
      minimum: 0,
    },
    outboxEventCount: {
      type: 'integer',
      minimum: 0,
    },
    emergencyActive: {
      type: 'boolean',
    },
    preservedTopicCount: {
      type: 'integer',
      minimum: 0,
    },
    preservedRoomCount: {
      type: 'integer',
      minimum: 0,
    },
    confirmPhrase: {
      type: 'string',
    },
    serverTime: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const RuntimeResetRequest = {
  type: 'object',
  required: ['confirmPhrase'],
  additionalProperties: false,
  properties: {
    confirmPhrase: {
      type: 'string',
      minLength: 1,
      maxLength: 64,
    },
  },
} as const;

export const RuntimeResetResponse = {
  type: 'object',
  required: [
    'resetVisitCount',
    'clearedOutboxCount',
    'emergencyCleared',
    'preservedTopicCount',
    'preservedRoomCount',
    'checkinLocked',
    'dayClosePhase',
    'lastResetBusinessDay',
    'updatedAt',
    'sandboxRestartRequired',
    'sandboxRestartInitiated',
  ],
  properties: {
    resetVisitCount: {
      type: 'integer',
      minimum: 0,
    },
    clearedOutboxCount: {
      type: 'integer',
      minimum: 0,
    },
    emergencyCleared: {
      type: 'boolean',
    },
    preservedTopicCount: {
      type: 'integer',
      minimum: 0,
    },
    preservedRoomCount: {
      type: 'integer',
      minimum: 0,
    },
    checkinLocked: {
      type: 'boolean',
      const: true,
    },
    dayClosePhase: {
      type: 'string',
      enum: ['open', 'started'],
    },
    lastResetBusinessDay: {
      type: 'string',
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
    sandboxRestartRequired: {
      type: 'boolean',
      const: true,
    },
    sandboxRestartInitiated: {
      type: 'boolean',
      const: true,
    },
  },
} as const;

export const TerminalPatientLocale = {
  type: 'string',
  enum: ['de-DE', 'en-GB', 'tr-TR', 'ru-RU', 'uk-UA'],
} as const;

export const TerminalPatientLocales = {
  type: 'array',
  items: {
    type: 'string',
    enum: ['de-DE', 'en-GB', 'tr-TR', 'ru-RU', 'uk-UA'],
  },
  minItems: 1,
  uniqueItems: true,
} as const;

export const OpsPatientLocalesResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['terminalPatientLocales', 'portalEnabled'],
  properties: {
    terminalPatientLocales: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['de-DE', 'en-GB', 'tr-TR', 'ru-RU', 'uk-UA'],
      },
      minItems: 1,
      uniqueItems: true,
    },
    portalEnabled: {
      type: 'boolean',
    },
  },
} as const;

export const OpsHeartbeatResponse = {
  type: 'object',
  required: [
    'status',
    'service',
    'serverTime',
    'uptimeSeconds',
    'checkinLocked',
    'dayClosePhase',
    'emergencyEnabled',
    'terminalWlanPromoEnabled',
    'terminalAuthPhoneEnabled',
    'terminalAuthNameDobEnabled',
    'terminalAuthEgkEnabled',
    'terminalPatientLocales',
    'emergencyActive',
  ],
  properties: {
    status: {
      type: 'string',
      const: 'ok',
    },
    service: {
      type: 'string',
      const: 'app',
    },
    serverTime: {
      type: 'string',
      format: 'date-time',
    },
    uptimeSeconds: {
      type: 'integer',
    },
    checkinLocked: {
      type: 'boolean',
    },
    dayClosePhase: {
      type: 'string',
      enum: ['open', 'started'],
    },
    emergencyEnabled: {
      type: 'boolean',
    },
    terminalWlanPromoEnabled: {
      type: 'boolean',
    },
    terminalAuthPhoneEnabled: {
      type: 'boolean',
    },
    terminalAuthNameDobEnabled: {
      type: 'boolean',
    },
    terminalAuthEgkEnabled: {
      type: 'boolean',
    },
    terminalPatientLocales: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['de-DE', 'en-GB', 'tr-TR', 'ru-RU', 'uk-UA'],
      },
      minItems: 1,
      uniqueItems: true,
    },
    emergencyActive: {
      type: 'boolean',
    },
  },
} as const;

export const OpsOnboardingStatus = {
  type: 'object',
  required: [
    'phase',
    'setupCompletedAt',
    'setupLastStep',
    'portalEnabled',
    'setupContactMode',
    'checks',
    'userFolders',
    'requiredChecksOk',
    'checksVerified',
  ],
  properties: {
    phase: {
      type: 'string',
      enum: ['pristine', 'wizard_in_progress', 'completed'],
    },
    setupCompletedAt: {
      type: ['string', 'null'],
      format: 'date-time',
    },
    setupLastStep: {
      type: 'string',
      enum: [
        'welcome',
        'practice',
        'storage',
        'contacts',
        'messaging',
        'portal',
        'summary',
        'verify',
      ],
    },
    portalEnabled: {
      type: 'boolean',
    },
    setupContactMode: {
      type: 'string',
      enum: ['unset', 'sample', 'own'],
    },
    checks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'ok', 'required', 'hint'],
        properties: {
          id: {
            type: 'string',
          },
          ok: {
            type: 'boolean',
          },
          required: {
            type: 'boolean',
          },
          hint: {
            type: ['string', 'null'],
          },
        },
      },
    },
    userFolders: {
      type: 'object',
      required: ['imports', 'exports'],
      properties: {
        imports: {
          type: 'string',
        },
        exports: {
          type: 'string',
        },
      },
    },
    requiredChecksOk: {
      type: 'boolean',
    },
    checksVerified: {
      type: 'boolean',
    },
  },
} as const;

export const PracticeProfile = {
  type: 'object',
  required: [
    'displayName',
    'street',
    'postalCode',
    'city',
    'phone',
    'email',
    'dataProtectionOfficer',
    'website',
  ],
  additionalProperties: false,
  properties: {
    displayName: {
      type: 'string',
      maxLength: 160,
    },
    street: {
      type: 'string',
      maxLength: 160,
    },
    postalCode: {
      type: 'string',
      maxLength: 16,
    },
    city: {
      type: 'string',
      maxLength: 120,
    },
    phone: {
      type: 'string',
      maxLength: 64,
    },
    email: {
      type: 'string',
      maxLength: 160,
    },
    dataProtectionOfficer: {
      type: 'string',
      maxLength: 160,
    },
    website: {
      type: 'string',
      maxLength: 200,
    },
  },
} as const;

export const OpsSettingsResponse = {
  type: 'object',
  required: [
    'routingMode',
    'returnWindowMinutes',
    'practiceOpenFrom',
    'practiceOpenTo',
    'topics',
    'rooms',
    'contactLookupFolderPath',
    'contactLookupDelimiterMode',
    'contactLookupHasHeader',
    'contactLookupMapping',
    'emergencyEnabled',
    'terminalWlanPromoEnabled',
    'terminalAuthPhoneEnabled',
    'terminalAuthNameDobEnabled',
    'terminalAuthEgkEnabled',
    'terminalPatientLocales',
    'smsProvider',
    'exportBasePath',
    'practiceProfile',
    'updatedAt',
  ],
  properties: {
    routingMode: {
      type: 'string',
      enum: ['simple', 'complex'],
    },
    returnWindowMinutes: {
      type: 'integer',
      minimum: 1,
      maximum: 240,
    },
    practiceOpenFrom: {
      type: 'string',
      pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
    },
    practiceOpenTo: {
      type: 'string',
      pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
    },
    topics: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'topicId',
          'label',
          'laneCode',
          'defaultRoomId',
          'iconId',
          'accentColor',
          'enabled',
          'availableFrom',
          'availableTo',
          'sortOrder',
        ],
        additionalProperties: false,
        properties: {
          topicId: {
            type: 'string',
            minLength: 1,
            maxLength: 64,
            pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
          },
          label: {
            type: 'string',
            minLength: 1,
            maxLength: 128,
          },
          laneCode: {
            type: 'string',
            pattern: '^[A-Z]$',
          },
          defaultRoomId: {
            type: 'string',
            minLength: 1,
            maxLength: 64,
          },
          iconId: {
            type: ['string', 'null'],
          },
          accentColor: {
            type: 'string',
            pattern: '^#[0-9A-Fa-f]{6}$',
          },
          enabled: {
            type: 'boolean',
          },
          availableFrom: {
            type: ['string', 'null'],
            pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
          },
          availableTo: {
            type: ['string', 'null'],
            pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
          },
          sortOrder: {
            type: 'integer',
            minimum: 0,
            maximum: 99,
          },
        },
      },
    },
    rooms: {
      type: 'array',
      items: {
        type: 'object',
        required: ['roomId', 'roomLabel', 'enabled'],
        additionalProperties: false,
        properties: {
          roomId: {
            type: 'string',
            minLength: 1,
            maxLength: 64,
          },
          roomLabel: {
            type: 'string',
            minLength: 1,
            maxLength: 128,
          },
          enabled: {
            type: 'boolean',
          },
          defaultCallTarget: {
            type: 'boolean',
          },
          maxOccupancy: {
            type: ['integer', 'null'],
            minimum: 1,
          },
          panel: {
            type: 'object',
            required: [
              'enabled',
              'placement',
              'mode',
              'showPatientNames',
              'calledTextPreset',
              'calledTextCustom',
              'arrivedTextPreset',
              'arrivedTextCustom',
            ],
            additionalProperties: false,
            properties: {
              enabled: {
                type: 'boolean',
              },
              placement: {
                type: 'string',
                enum: ['outside', 'inside'],
              },
              mode: {
                type: 'string',
                enum: ['display_only', 'arrival', 'staff_full'],
              },
              showPatientNames: {
                type: 'boolean',
              },
              calledTextPreset: {
                type: 'string',
                enum: [
                  'you_are_right',
                  'please_wait_here',
                  'please_enter',
                  'go_to_reception',
                  'custom',
                ],
              },
              calledTextCustom: {
                type: ['string', 'null'],
                maxLength: 80,
              },
              arrivedTextPreset: {
                type: 'string',
                enum: [
                  'you_are_right',
                  'please_wait_here',
                  'please_enter',
                  'go_to_reception',
                  'custom',
                ],
              },
              arrivedTextCustom: {
                type: ['string', 'null'],
                maxLength: 80,
              },
            },
          },
        },
      },
    },
    contactLookupFolderPath: {
      type: ['string', 'null'],
      maxLength: 4096,
    },
    contactLookupDelimiterMode: {
      type: 'string',
      enum: ['auto', 'semicolon', 'comma', 'tab'],
    },
    contactLookupHasHeader: {
      type: 'boolean',
    },
    contactLookupMapping: {
      type: 'object',
      required: ['mobile'],
      additionalProperties: false,
      properties: {
        mobile: {
          oneOf: [
            {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            {
              type: 'integer',
              minimum: 0,
              maximum: 512,
            },
          ],
        },
        lastName: {
          oneOf: [
            {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            {
              type: 'integer',
              minimum: 0,
              maximum: 512,
            },
          ],
        },
        firstName: {
          oneOf: [
            {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            {
              type: 'integer',
              minimum: 0,
              maximum: 512,
            },
          ],
        },
        birthDate: {
          oneOf: [
            {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            {
              type: 'integer',
              minimum: 0,
              maximum: 512,
            },
          ],
        },
      },
    },
    emergencyEnabled: {
      type: 'boolean',
    },
    terminalWlanPromoEnabled: {
      type: 'boolean',
    },
    terminalAuthPhoneEnabled: {
      type: 'boolean',
    },
    terminalAuthNameDobEnabled: {
      type: 'boolean',
    },
    terminalAuthEgkEnabled: {
      type: 'boolean',
    },
    terminalPatientLocales: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['de-DE', 'en-GB', 'tr-TR', 'ru-RU', 'uk-UA'],
      },
      minItems: 1,
      uniqueItems: true,
    },
    smsProvider: {
      type: 'string',
      enum: ['mock', 'seven'],
    },
    exportBasePath: {
      type: 'string',
      minLength: 1,
      maxLength: 4096,
    },
    practiceProfile: {
      type: 'object',
      required: [
        'displayName',
        'street',
        'postalCode',
        'city',
        'phone',
        'email',
        'dataProtectionOfficer',
        'website',
      ],
      additionalProperties: false,
      properties: {
        displayName: {
          type: 'string',
          maxLength: 160,
        },
        street: {
          type: 'string',
          maxLength: 160,
        },
        postalCode: {
          type: 'string',
          maxLength: 16,
        },
        city: {
          type: 'string',
          maxLength: 120,
        },
        phone: {
          type: 'string',
          maxLength: 64,
        },
        email: {
          type: 'string',
          maxLength: 160,
        },
        dataProtectionOfficer: {
          type: 'string',
          maxLength: 160,
        },
        website: {
          type: 'string',
          maxLength: 200,
        },
      },
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const RoutingCapabilitiesResponse = {
  type: 'object',
  required: ['routingMode', 'features'],
  additionalProperties: false,
  properties: {
    routingMode: {
      type: 'string',
      enum: ['simple', 'complex'],
    },
    features: {
      type: 'object',
      required: ['complexRouting', 'journeyDesigner', 'routingSimulator'],
      additionalProperties: false,
      properties: {
        complexRouting: {
          type: 'boolean',
        },
        journeyDesigner: {
          type: 'boolean',
        },
        routingSimulator: {
          type: 'boolean',
        },
      },
    },
  },
} as const;

export const DeploymentVolumeStatus = {
  type: 'object',
  required: ['containerPath', 'userFolderLabel', 'ready', 'hint', 'csvFiles', 'importFolders'],
  properties: {
    containerPath: {
      type: 'string',
    },
    userFolderLabel: {
      type: 'string',
    },
    ready: {
      type: 'boolean',
    },
    hint: {
      type: ['string', 'null'],
    },
    csvFiles: {
      type: 'array',
      items: {
        type: 'object',
        required: ['fileName', 'containerPath', 'sizeBytes', 'updatedAt'],
        properties: {
          fileName: {
            type: 'string',
          },
          containerPath: {
            type: 'string',
          },
          sizeBytes: {
            type: 'integer',
            minimum: 0,
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
          },
        },
      },
    },
    importFolders: {
      type: 'array',
      items: {
        type: 'object',
        required: ['label', 'containerPath'],
        properties: {
          label: {
            type: 'string',
          },
          containerPath: {
            type: 'string',
          },
        },
      },
    },
  },
} as const;

export const DeploymentStorageResponse = {
  type: 'object',
  required: ['imports', 'exports', 'serverTime'],
  properties: {
    imports: {
      type: 'object',
      required: ['containerPath', 'userFolderLabel', 'ready', 'hint', 'csvFiles', 'importFolders'],
      properties: {
        containerPath: {
          type: 'string',
        },
        userFolderLabel: {
          type: 'string',
        },
        ready: {
          type: 'boolean',
        },
        hint: {
          type: ['string', 'null'],
        },
        csvFiles: {
          type: 'array',
          items: {
            type: 'object',
            required: ['fileName', 'containerPath', 'sizeBytes', 'updatedAt'],
            properties: {
              fileName: {
                type: 'string',
              },
              containerPath: {
                type: 'string',
              },
              sizeBytes: {
                type: 'integer',
                minimum: 0,
              },
              updatedAt: {
                type: 'string',
                format: 'date-time',
              },
            },
          },
        },
        importFolders: {
          type: 'array',
          items: {
            type: 'object',
            required: ['label', 'containerPath'],
            properties: {
              label: {
                type: 'string',
              },
              containerPath: {
                type: 'string',
              },
            },
          },
        },
      },
    },
    exports: {
      type: 'object',
      required: ['containerPath', 'userFolderLabel', 'ready', 'hint', 'csvFiles', 'importFolders'],
      properties: {
        containerPath: {
          type: 'string',
        },
        userFolderLabel: {
          type: 'string',
        },
        ready: {
          type: 'boolean',
        },
        hint: {
          type: ['string', 'null'],
        },
        csvFiles: {
          type: 'array',
          items: {
            type: 'object',
            required: ['fileName', 'containerPath', 'sizeBytes', 'updatedAt'],
            properties: {
              fileName: {
                type: 'string',
              },
              containerPath: {
                type: 'string',
              },
              sizeBytes: {
                type: 'integer',
                minimum: 0,
              },
              updatedAt: {
                type: 'string',
                format: 'date-time',
              },
            },
          },
        },
        importFolders: {
          type: 'array',
          items: {
            type: 'object',
            required: ['label', 'containerPath'],
            properties: {
              label: {
                type: 'string',
              },
              containerPath: {
                type: 'string',
              },
            },
          },
        },
      },
    },
    serverTime: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const ContactLookupValidateRequest = {
  type: 'object',
  required: [
    'contactLookupFolderPath',
    'contactLookupDelimiterMode',
    'contactLookupHasHeader',
    'contactLookupMapping',
  ],
  additionalProperties: false,
  properties: {
    contactLookupFolderPath: {
      type: 'string',
      minLength: 1,
      maxLength: 4096,
    },
    contactLookupDelimiterMode: {
      type: 'string',
      enum: ['auto', 'semicolon', 'comma', 'tab'],
    },
    contactLookupHasHeader: {
      type: 'boolean',
    },
    contactLookupMapping: {
      type: 'object',
      required: ['mobile'],
      additionalProperties: false,
      properties: {
        mobile: {
          oneOf: [
            {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            {
              type: 'integer',
              minimum: 0,
              maximum: 512,
            },
          ],
        },
        lastName: {
          oneOf: [
            {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            {
              type: 'integer',
              minimum: 0,
              maximum: 512,
            },
          ],
        },
        firstName: {
          oneOf: [
            {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            {
              type: 'integer',
              minimum: 0,
              maximum: 512,
            },
          ],
        },
        birthDate: {
          oneOf: [
            {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            {
              type: 'integer',
              minimum: 0,
              maximum: 512,
            },
          ],
        },
      },
    },
  },
} as const;

export const ContactLookupValidateResponse = {
  type: 'object',
  required: ['ok', 'detectedDelimiterMode', 'layout', 'csvFileCount', 'patientCount', 'sampleRows'],
  properties: {
    ok: {
      type: 'boolean',
      const: true,
    },
    detectedDelimiterMode: {
      type: 'string',
      enum: ['semicolon', 'comma', 'tab'],
    },
    layout: {
      type: 'string',
      enum: ['list', 'per_patient', 'mixed'],
    },
    csvFileCount: {
      type: 'integer',
      minimum: 0,
    },
    patientCount: {
      type: 'integer',
      minimum: 0,
    },
    sampleRows: {
      type: 'integer',
      minimum: 0,
    },
  },
} as const;

export const ContactLookupPreviewResponse = {
  type: 'object',
  required: [
    'detectedDelimiterMode',
    'layout',
    'csvFileCount',
    'patientCount',
    'columns',
    'sampleRows',
    'sampleSourceFile',
    'suggestedMapping',
    'scannedAt',
  ],
  properties: {
    detectedDelimiterMode: {
      type: 'string',
      enum: ['semicolon', 'comma', 'tab'],
    },
    layout: {
      type: 'string',
      enum: ['list', 'per_patient', 'mixed'],
    },
    csvFileCount: {
      type: 'integer',
      minimum: 0,
    },
    patientCount: {
      type: 'integer',
      minimum: 0,
    },
    columns: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    sampleRows: {
      type: 'array',
      items: {
        type: 'array',
        items: {
          type: 'string',
        },
      },
    },
    sampleSourceFile: {
      type: 'string',
    },
    scannedAt: {
      type: 'string',
      format: 'date-time',
    },
    suggestedMapping: {
      type: 'object',
      additionalProperties: false,
      properties: {
        mobile: {
          oneOf: [
            {
              type: 'string',
            },
            {
              type: 'integer',
            },
          ],
        },
        lastName: {
          oneOf: [
            {
              type: 'string',
            },
            {
              type: 'integer',
            },
          ],
        },
        firstName: {
          oneOf: [
            {
              type: 'string',
            },
            {
              type: 'integer',
            },
          ],
        },
        birthDate: {
          oneOf: [
            {
              type: 'string',
            },
            {
              type: 'integer',
            },
          ],
        },
      },
    },
  },
} as const;

export const OutboxStatusResponse = {
  type: 'object',
  required: [
    'readyCount',
    'retryScheduledCount',
    'deadLetterCount',
    'oldestPendingCreatedAt',
    'serverTime',
  ],
  properties: {
    readyCount: {
      type: 'integer',
    },
    retryScheduledCount: {
      type: 'integer',
    },
    deadLetterCount: {
      type: 'integer',
    },
    oldestPendingCreatedAt: {
      type: ['string', 'null'],
      format: 'date-time',
    },
    serverTime: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const DayLifecycleResponse = {
  type: 'object',
  required: [
    'businessDay',
    'lastResetBusinessDay',
    'needsDayStartHint',
    'checkinLocked',
    'dayClosePhase',
    'lastDayStats',
  ],
  properties: {
    businessDay: {
      type: 'string',
    },
    lastResetBusinessDay: {
      type: 'string',
    },
    needsDayStartHint: {
      type: 'boolean',
    },
    checkinLocked: {
      type: 'boolean',
    },
    dayClosePhase: {
      type: 'string',
      enum: ['open', 'started'],
    },
    lastDayStats: {
      oneOf: [
        {
          type: 'null',
        },
        {
          type: 'object',
          required: ['businessDay', 'totalVisits', 'maxWaitMs', 'byTopic', 'openVisits'],
          properties: {
            businessDay: {
              type: 'string',
            },
            totalVisits: {
              type: 'integer',
            },
            maxWaitMs: {
              type: 'integer',
            },
            byTopic: {
              type: 'array',
              items: {
                type: 'object',
                required: ['topicId', 'topicLabel', 'count'],
                properties: {
                  topicId: {
                    type: 'string',
                  },
                  topicLabel: {
                    type: 'string',
                  },
                  count: {
                    type: 'integer',
                  },
                },
              },
            },
            openVisits: {
              type: 'array',
              items: {
                type: 'object',
                required: ['visitId', 'laneCode', 'number', 'topicLabel', 'identityRef', 'status'],
                properties: {
                  visitId: {
                    type: 'string',
                  },
                  laneCode: {
                    type: 'string',
                  },
                  number: {
                    type: 'integer',
                  },
                  topicLabel: {
                    type: 'string',
                  },
                  identityRef: {
                    type: ['string', 'null'],
                  },
                  status: {
                    type: 'string',
                    enum: [
                      'waiting',
                      'called',
                      'in_room',
                      'absent_wait_here',
                      'absent_return_later',
                    ],
                  },
                },
              },
            },
          },
        },
      ],
    },
  },
} as const;

export const DevicePresenceRequest = {
  type: 'object',
  additionalProperties: false,
  properties: {
    deviceId: {
      type: 'string',
      minLength: 1,
      maxLength: 64,
    },
    clientTime: {
      type: 'string',
      format: 'date-time',
    },
    lastRevision: {
      type: 'integer',
      minimum: 0,
    },
  },
} as const;

export const EmergencyRaiseResponse = {
  type: 'object',
  required: ['emergencyId', 'status', 'raisedAt', 'alreadyActive'],
  properties: {
    emergencyId: {
      type: 'string',
      minLength: 1,
    },
    status: {
      type: 'string',
      const: 'raised',
    },
    raisedAt: {
      type: 'string',
      format: 'date-time',
    },
    alreadyActive: {
      type: 'boolean',
    },
  },
} as const;

export const EmergencyAcknowledgeRequest = {
  type: 'object',
  required: ['emergencyId', 'uiDisplayed'],
  additionalProperties: false,
  properties: {
    emergencyId: {
      type: 'string',
      minLength: 1,
      maxLength: 128,
    },
    uiDisplayed: {
      type: 'boolean',
      const: true,
    },
  },
} as const;

export const EmergencyAcknowledgeResponse = {
  type: 'object',
  required: ['emergencyId', 'status', 'raisedAt', 'acknowledgedAt', 'uiDisplayed'],
  properties: {
    emergencyId: {
      type: 'string',
      minLength: 1,
    },
    status: {
      type: 'string',
      const: 'acknowledged',
    },
    raisedAt: {
      type: 'string',
      format: 'date-time',
    },
    acknowledgedAt: {
      type: 'string',
      format: 'date-time',
    },
    uiDisplayed: {
      type: 'boolean',
      const: true,
    },
  },
} as const;

export const MessagingProviderCatalogResponse = {
  type: 'object',
  required: ['channels'],
  properties: {
    channels: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'providers'],
        properties: {
          id: {
            type: 'string',
            enum: ['sms', 'messenger'],
          },
          providers: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'label', 'channel', 'configured', 'enabled', 'requires'],
              properties: {
                id: {
                  type: 'string',
                },
                label: {
                  type: 'string',
                },
                channel: {
                  type: 'string',
                  enum: ['sms', 'messenger'],
                },
                configured: {
                  type: 'boolean',
                },
                enabled: {
                  type: 'boolean',
                },
                requires: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

export const GET_api_v1_ops_healthResponse200 = {
  type: 'object',
  required: ['status', 'service', 'timestamp'],
  properties: {
    status: {
      type: 'string',
    },
    service: {
      type: 'string',
    },
    timestamp: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const GET_api_v1_practice_profileResponse200 = {
  type: 'object',
  required: [
    'displayName',
    'street',
    'postalCode',
    'city',
    'phone',
    'email',
    'dataProtectionOfficer',
    'website',
  ],
  additionalProperties: false,
  properties: {
    displayName: {
      type: 'string',
      maxLength: 160,
    },
    street: {
      type: 'string',
      maxLength: 160,
    },
    postalCode: {
      type: 'string',
      maxLength: 16,
    },
    city: {
      type: 'string',
      maxLength: 120,
    },
    phone: {
      type: 'string',
      maxLength: 64,
    },
    email: {
      type: 'string',
      maxLength: 160,
    },
    dataProtectionOfficer: {
      type: 'string',
      maxLength: 160,
    },
    website: {
      type: 'string',
      maxLength: 200,
    },
  },
} as const;

export const GET_api_v1_ops_patient_localesResponse200 = {
  type: 'object',
  additionalProperties: false,
  required: ['terminalPatientLocales', 'portalEnabled'],
  properties: {
    terminalPatientLocales: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['de-DE', 'en-GB', 'tr-TR', 'ru-RU', 'uk-UA'],
      },
      minItems: 1,
      uniqueItems: true,
    },
    portalEnabled: {
      type: 'boolean',
    },
  },
} as const;

export const GET_api_v1_ops_heartbeatResponse200 = {
  type: 'object',
  required: [
    'status',
    'service',
    'serverTime',
    'uptimeSeconds',
    'checkinLocked',
    'dayClosePhase',
    'emergencyEnabled',
    'terminalWlanPromoEnabled',
    'terminalAuthPhoneEnabled',
    'terminalAuthNameDobEnabled',
    'terminalAuthEgkEnabled',
    'terminalPatientLocales',
    'emergencyActive',
  ],
  properties: {
    status: {
      type: 'string',
      const: 'ok',
    },
    service: {
      type: 'string',
      const: 'app',
    },
    serverTime: {
      type: 'string',
      format: 'date-time',
    },
    uptimeSeconds: {
      type: 'integer',
    },
    checkinLocked: {
      type: 'boolean',
    },
    dayClosePhase: {
      type: 'string',
      enum: ['open', 'started'],
    },
    emergencyEnabled: {
      type: 'boolean',
    },
    terminalWlanPromoEnabled: {
      type: 'boolean',
    },
    terminalAuthPhoneEnabled: {
      type: 'boolean',
    },
    terminalAuthNameDobEnabled: {
      type: 'boolean',
    },
    terminalAuthEgkEnabled: {
      type: 'boolean',
    },
    terminalPatientLocales: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['de-DE', 'en-GB', 'tr-TR', 'ru-RU', 'uk-UA'],
      },
      minItems: 1,
      uniqueItems: true,
    },
    emergencyActive: {
      type: 'boolean',
    },
  },
} as const;

export const GET_api_v1_ops_settingsResponse200 = {
  type: 'object',
  required: [
    'routingMode',
    'returnWindowMinutes',
    'practiceOpenFrom',
    'practiceOpenTo',
    'topics',
    'rooms',
    'contactLookupFolderPath',
    'contactLookupDelimiterMode',
    'contactLookupHasHeader',
    'contactLookupMapping',
    'emergencyEnabled',
    'terminalWlanPromoEnabled',
    'terminalAuthPhoneEnabled',
    'terminalAuthNameDobEnabled',
    'terminalAuthEgkEnabled',
    'terminalPatientLocales',
    'smsProvider',
    'exportBasePath',
    'practiceProfile',
    'updatedAt',
  ],
  properties: {
    routingMode: {
      type: 'string',
      enum: ['simple', 'complex'],
    },
    returnWindowMinutes: {
      type: 'integer',
      minimum: 1,
      maximum: 240,
    },
    practiceOpenFrom: {
      type: 'string',
      pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
    },
    practiceOpenTo: {
      type: 'string',
      pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
    },
    topics: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'topicId',
          'label',
          'laneCode',
          'defaultRoomId',
          'iconId',
          'accentColor',
          'enabled',
          'availableFrom',
          'availableTo',
          'sortOrder',
        ],
        additionalProperties: false,
        properties: {
          topicId: {
            type: 'string',
            minLength: 1,
            maxLength: 64,
            pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
          },
          label: {
            type: 'string',
            minLength: 1,
            maxLength: 128,
          },
          laneCode: {
            type: 'string',
            pattern: '^[A-Z]$',
          },
          defaultRoomId: {
            type: 'string',
            minLength: 1,
            maxLength: 64,
          },
          iconId: {
            type: ['string', 'null'],
          },
          accentColor: {
            type: 'string',
            pattern: '^#[0-9A-Fa-f]{6}$',
          },
          enabled: {
            type: 'boolean',
          },
          availableFrom: {
            type: ['string', 'null'],
            pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
          },
          availableTo: {
            type: ['string', 'null'],
            pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
          },
          sortOrder: {
            type: 'integer',
            minimum: 0,
            maximum: 99,
          },
        },
      },
    },
    rooms: {
      type: 'array',
      items: {
        type: 'object',
        required: ['roomId', 'roomLabel', 'enabled'],
        additionalProperties: false,
        properties: {
          roomId: {
            type: 'string',
            minLength: 1,
            maxLength: 64,
          },
          roomLabel: {
            type: 'string',
            minLength: 1,
            maxLength: 128,
          },
          enabled: {
            type: 'boolean',
          },
          defaultCallTarget: {
            type: 'boolean',
          },
          maxOccupancy: {
            type: ['integer', 'null'],
            minimum: 1,
          },
          panel: {
            type: 'object',
            required: [
              'enabled',
              'placement',
              'mode',
              'showPatientNames',
              'calledTextPreset',
              'calledTextCustom',
              'arrivedTextPreset',
              'arrivedTextCustom',
            ],
            additionalProperties: false,
            properties: {
              enabled: {
                type: 'boolean',
              },
              placement: {
                type: 'string',
                enum: ['outside', 'inside'],
              },
              mode: {
                type: 'string',
                enum: ['display_only', 'arrival', 'staff_full'],
              },
              showPatientNames: {
                type: 'boolean',
              },
              calledTextPreset: {
                type: 'string',
                enum: [
                  'you_are_right',
                  'please_wait_here',
                  'please_enter',
                  'go_to_reception',
                  'custom',
                ],
              },
              calledTextCustom: {
                type: ['string', 'null'],
                maxLength: 80,
              },
              arrivedTextPreset: {
                type: 'string',
                enum: [
                  'you_are_right',
                  'please_wait_here',
                  'please_enter',
                  'go_to_reception',
                  'custom',
                ],
              },
              arrivedTextCustom: {
                type: ['string', 'null'],
                maxLength: 80,
              },
            },
          },
        },
      },
    },
    contactLookupFolderPath: {
      type: ['string', 'null'],
      maxLength: 4096,
    },
    contactLookupDelimiterMode: {
      type: 'string',
      enum: ['auto', 'semicolon', 'comma', 'tab'],
    },
    contactLookupHasHeader: {
      type: 'boolean',
    },
    contactLookupMapping: {
      type: 'object',
      required: ['mobile'],
      additionalProperties: false,
      properties: {
        mobile: {
          oneOf: [
            {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            {
              type: 'integer',
              minimum: 0,
              maximum: 512,
            },
          ],
        },
        lastName: {
          oneOf: [
            {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            {
              type: 'integer',
              minimum: 0,
              maximum: 512,
            },
          ],
        },
        firstName: {
          oneOf: [
            {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            {
              type: 'integer',
              minimum: 0,
              maximum: 512,
            },
          ],
        },
        birthDate: {
          oneOf: [
            {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            {
              type: 'integer',
              minimum: 0,
              maximum: 512,
            },
          ],
        },
      },
    },
    emergencyEnabled: {
      type: 'boolean',
    },
    terminalWlanPromoEnabled: {
      type: 'boolean',
    },
    terminalAuthPhoneEnabled: {
      type: 'boolean',
    },
    terminalAuthNameDobEnabled: {
      type: 'boolean',
    },
    terminalAuthEgkEnabled: {
      type: 'boolean',
    },
    terminalPatientLocales: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['de-DE', 'en-GB', 'tr-TR', 'ru-RU', 'uk-UA'],
      },
      minItems: 1,
      uniqueItems: true,
    },
    smsProvider: {
      type: 'string',
      enum: ['mock', 'seven'],
    },
    exportBasePath: {
      type: 'string',
      minLength: 1,
      maxLength: 4096,
    },
    practiceProfile: {
      type: 'object',
      required: [
        'displayName',
        'street',
        'postalCode',
        'city',
        'phone',
        'email',
        'dataProtectionOfficer',
        'website',
      ],
      additionalProperties: false,
      properties: {
        displayName: {
          type: 'string',
          maxLength: 160,
        },
        street: {
          type: 'string',
          maxLength: 160,
        },
        postalCode: {
          type: 'string',
          maxLength: 16,
        },
        city: {
          type: 'string',
          maxLength: 120,
        },
        phone: {
          type: 'string',
          maxLength: 64,
        },
        email: {
          type: 'string',
          maxLength: 160,
        },
        dataProtectionOfficer: {
          type: 'string',
          maxLength: 160,
        },
        website: {
          type: 'string',
          maxLength: 200,
        },
      },
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const PATCH_api_v1_ops_settingsRequestBody = {
  type: 'object',
  minProperties: 1,
  additionalProperties: false,
  properties: {
    routingMode: {
      type: 'string',
      enum: ['simple', 'complex'],
    },
    returnWindowMinutes: {
      type: 'integer',
      minimum: 1,
      maximum: 240,
    },
    practiceOpenFrom: {
      type: 'string',
      pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
    },
    practiceOpenTo: {
      type: 'string',
      pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
    },
    topics: {
      type: 'array',
      items: {
        type: 'object',
        required: ['topicId'],
        additionalProperties: false,
        properties: {
          topicId: {
            type: 'string',
            minLength: 1,
            maxLength: 64,
            pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
          },
          label: {
            type: 'string',
            minLength: 1,
            maxLength: 128,
          },
          laneCode: {
            type: 'string',
            pattern: '^[A-Z]$',
          },
          defaultRoomId: {
            type: 'string',
            minLength: 1,
            maxLength: 64,
          },
          iconId: {
            type: ['string', 'null'],
          },
          accentColor: {
            type: 'string',
            pattern: '^#[0-9A-Fa-f]{6}$',
          },
          enabled: {
            type: 'boolean',
          },
          availableFrom: {
            type: ['string', 'null'],
            pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
          },
          availableTo: {
            type: ['string', 'null'],
            pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
          },
          sortOrder: {
            type: 'integer',
            minimum: 0,
            maximum: 99,
          },
        },
      },
    },
    rooms: {
      type: 'array',
      items: {
        type: 'object',
        required: ['roomId', 'roomLabel'],
        additionalProperties: false,
        properties: {
          roomId: {
            type: 'string',
            minLength: 1,
            maxLength: 64,
          },
          roomLabel: {
            type: 'string',
            minLength: 1,
            maxLength: 128,
          },
          enabled: {
            type: 'boolean',
          },
          defaultCallTarget: {
            type: 'boolean',
          },
          maxOccupancy: {
            type: ['integer', 'null'],
            minimum: 1,
          },
          panel: {
            type: 'object',
            additionalProperties: false,
            properties: {
              enabled: {
                type: 'boolean',
              },
              placement: {
                type: 'string',
                enum: ['outside', 'inside'],
              },
              mode: {
                type: 'string',
                enum: ['display_only', 'arrival', 'staff_full'],
              },
              showPatientNames: {
                type: 'boolean',
              },
              calledTextPreset: {
                type: 'string',
                enum: [
                  'you_are_right',
                  'please_wait_here',
                  'please_enter',
                  'go_to_reception',
                  'custom',
                ],
              },
              calledTextCustom: {
                type: ['string', 'null'],
                maxLength: 80,
              },
              arrivedTextPreset: {
                type: 'string',
                enum: [
                  'you_are_right',
                  'please_wait_here',
                  'please_enter',
                  'go_to_reception',
                  'custom',
                ],
              },
              arrivedTextCustom: {
                type: ['string', 'null'],
                maxLength: 80,
              },
            },
          },
        },
      },
    },
    contactLookupFolderPath: {
      type: ['string', 'null'],
      maxLength: 4096,
    },
    contactLookupDelimiterMode: {
      type: 'string',
      enum: ['auto', 'semicolon', 'comma', 'tab'],
    },
    contactLookupHasHeader: {
      type: 'boolean',
    },
    contactLookupMapping: {
      type: 'object',
      required: ['mobile'],
      additionalProperties: false,
      properties: {
        mobile: {
          oneOf: [
            {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            {
              type: 'integer',
              minimum: 0,
              maximum: 512,
            },
          ],
        },
        lastName: {
          oneOf: [
            {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            {
              type: 'integer',
              minimum: 0,
              maximum: 512,
            },
          ],
        },
        firstName: {
          oneOf: [
            {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            {
              type: 'integer',
              minimum: 0,
              maximum: 512,
            },
          ],
        },
        birthDate: {
          oneOf: [
            {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            {
              type: 'integer',
              minimum: 0,
              maximum: 512,
            },
          ],
        },
      },
    },
    emergencyEnabled: {
      type: 'boolean',
    },
    terminalWlanPromoEnabled: {
      type: 'boolean',
    },
    terminalAuthPhoneEnabled: {
      type: 'boolean',
    },
    terminalAuthNameDobEnabled: {
      type: 'boolean',
    },
    terminalAuthEgkEnabled: {
      type: 'boolean',
    },
    terminalPatientLocales: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['de-DE', 'en-GB', 'tr-TR', 'ru-RU', 'uk-UA'],
      },
      minItems: 1,
      uniqueItems: true,
    },
    smsProvider: {
      type: 'string',
      enum: ['mock', 'seven'],
    },
    practiceProfile: {
      type: 'object',
      required: [
        'displayName',
        'street',
        'postalCode',
        'city',
        'phone',
        'email',
        'dataProtectionOfficer',
        'website',
      ],
      additionalProperties: false,
      properties: {
        displayName: {
          type: 'string',
          maxLength: 160,
        },
        street: {
          type: 'string',
          maxLength: 160,
        },
        postalCode: {
          type: 'string',
          maxLength: 16,
        },
        city: {
          type: 'string',
          maxLength: 120,
        },
        phone: {
          type: 'string',
          maxLength: 64,
        },
        email: {
          type: 'string',
          maxLength: 160,
        },
        dataProtectionOfficer: {
          type: 'string',
          maxLength: 160,
        },
        website: {
          type: 'string',
          maxLength: 200,
        },
      },
    },
  },
} as const;

export const PATCH_api_v1_ops_settingsResponse200 = {
  type: 'object',
  required: [
    'routingMode',
    'returnWindowMinutes',
    'practiceOpenFrom',
    'practiceOpenTo',
    'topics',
    'rooms',
    'contactLookupFolderPath',
    'contactLookupDelimiterMode',
    'contactLookupHasHeader',
    'contactLookupMapping',
    'emergencyEnabled',
    'terminalWlanPromoEnabled',
    'terminalAuthPhoneEnabled',
    'terminalAuthNameDobEnabled',
    'terminalAuthEgkEnabled',
    'terminalPatientLocales',
    'smsProvider',
    'exportBasePath',
    'practiceProfile',
    'updatedAt',
  ],
  properties: {
    routingMode: {
      type: 'string',
      enum: ['simple', 'complex'],
    },
    returnWindowMinutes: {
      type: 'integer',
      minimum: 1,
      maximum: 240,
    },
    practiceOpenFrom: {
      type: 'string',
      pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
    },
    practiceOpenTo: {
      type: 'string',
      pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
    },
    topics: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'topicId',
          'label',
          'laneCode',
          'defaultRoomId',
          'iconId',
          'accentColor',
          'enabled',
          'availableFrom',
          'availableTo',
          'sortOrder',
        ],
        additionalProperties: false,
        properties: {
          topicId: {
            type: 'string',
            minLength: 1,
            maxLength: 64,
            pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
          },
          label: {
            type: 'string',
            minLength: 1,
            maxLength: 128,
          },
          laneCode: {
            type: 'string',
            pattern: '^[A-Z]$',
          },
          defaultRoomId: {
            type: 'string',
            minLength: 1,
            maxLength: 64,
          },
          iconId: {
            type: ['string', 'null'],
          },
          accentColor: {
            type: 'string',
            pattern: '^#[0-9A-Fa-f]{6}$',
          },
          enabled: {
            type: 'boolean',
          },
          availableFrom: {
            type: ['string', 'null'],
            pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
          },
          availableTo: {
            type: ['string', 'null'],
            pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
          },
          sortOrder: {
            type: 'integer',
            minimum: 0,
            maximum: 99,
          },
        },
      },
    },
    rooms: {
      type: 'array',
      items: {
        type: 'object',
        required: ['roomId', 'roomLabel', 'enabled'],
        additionalProperties: false,
        properties: {
          roomId: {
            type: 'string',
            minLength: 1,
            maxLength: 64,
          },
          roomLabel: {
            type: 'string',
            minLength: 1,
            maxLength: 128,
          },
          enabled: {
            type: 'boolean',
          },
          defaultCallTarget: {
            type: 'boolean',
          },
          maxOccupancy: {
            type: ['integer', 'null'],
            minimum: 1,
          },
          panel: {
            type: 'object',
            required: [
              'enabled',
              'placement',
              'mode',
              'showPatientNames',
              'calledTextPreset',
              'calledTextCustom',
              'arrivedTextPreset',
              'arrivedTextCustom',
            ],
            additionalProperties: false,
            properties: {
              enabled: {
                type: 'boolean',
              },
              placement: {
                type: 'string',
                enum: ['outside', 'inside'],
              },
              mode: {
                type: 'string',
                enum: ['display_only', 'arrival', 'staff_full'],
              },
              showPatientNames: {
                type: 'boolean',
              },
              calledTextPreset: {
                type: 'string',
                enum: [
                  'you_are_right',
                  'please_wait_here',
                  'please_enter',
                  'go_to_reception',
                  'custom',
                ],
              },
              calledTextCustom: {
                type: ['string', 'null'],
                maxLength: 80,
              },
              arrivedTextPreset: {
                type: 'string',
                enum: [
                  'you_are_right',
                  'please_wait_here',
                  'please_enter',
                  'go_to_reception',
                  'custom',
                ],
              },
              arrivedTextCustom: {
                type: ['string', 'null'],
                maxLength: 80,
              },
            },
          },
        },
      },
    },
    contactLookupFolderPath: {
      type: ['string', 'null'],
      maxLength: 4096,
    },
    contactLookupDelimiterMode: {
      type: 'string',
      enum: ['auto', 'semicolon', 'comma', 'tab'],
    },
    contactLookupHasHeader: {
      type: 'boolean',
    },
    contactLookupMapping: {
      type: 'object',
      required: ['mobile'],
      additionalProperties: false,
      properties: {
        mobile: {
          oneOf: [
            {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            {
              type: 'integer',
              minimum: 0,
              maximum: 512,
            },
          ],
        },
        lastName: {
          oneOf: [
            {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            {
              type: 'integer',
              minimum: 0,
              maximum: 512,
            },
          ],
        },
        firstName: {
          oneOf: [
            {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            {
              type: 'integer',
              minimum: 0,
              maximum: 512,
            },
          ],
        },
        birthDate: {
          oneOf: [
            {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            {
              type: 'integer',
              minimum: 0,
              maximum: 512,
            },
          ],
        },
      },
    },
    emergencyEnabled: {
      type: 'boolean',
    },
    terminalWlanPromoEnabled: {
      type: 'boolean',
    },
    terminalAuthPhoneEnabled: {
      type: 'boolean',
    },
    terminalAuthNameDobEnabled: {
      type: 'boolean',
    },
    terminalAuthEgkEnabled: {
      type: 'boolean',
    },
    terminalPatientLocales: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['de-DE', 'en-GB', 'tr-TR', 'ru-RU', 'uk-UA'],
      },
      minItems: 1,
      uniqueItems: true,
    },
    smsProvider: {
      type: 'string',
      enum: ['mock', 'seven'],
    },
    exportBasePath: {
      type: 'string',
      minLength: 1,
      maxLength: 4096,
    },
    practiceProfile: {
      type: 'object',
      required: [
        'displayName',
        'street',
        'postalCode',
        'city',
        'phone',
        'email',
        'dataProtectionOfficer',
        'website',
      ],
      additionalProperties: false,
      properties: {
        displayName: {
          type: 'string',
          maxLength: 160,
        },
        street: {
          type: 'string',
          maxLength: 160,
        },
        postalCode: {
          type: 'string',
          maxLength: 16,
        },
        city: {
          type: 'string',
          maxLength: 120,
        },
        phone: {
          type: 'string',
          maxLength: 64,
        },
        email: {
          type: 'string',
          maxLength: 160,
        },
        dataProtectionOfficer: {
          type: 'string',
          maxLength: 160,
        },
        website: {
          type: 'string',
          maxLength: 200,
        },
      },
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const PATCH_api_v1_ops_settingsResponse400 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'VISIT_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const PATCH_api_v1_ops_settingsResponse403 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'VISIT_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const GET_api_v1_ops_settings_capabilitiesResponse200 = {
  type: 'object',
  required: ['routingMode', 'features'],
  additionalProperties: false,
  properties: {
    routingMode: {
      type: 'string',
      enum: ['simple', 'complex'],
    },
    features: {
      type: 'object',
      required: ['complexRouting', 'journeyDesigner', 'routingSimulator'],
      additionalProperties: false,
      properties: {
        complexRouting: {
          type: 'boolean',
        },
        journeyDesigner: {
          type: 'boolean',
        },
        routingSimulator: {
          type: 'boolean',
        },
      },
    },
  },
} as const;

export const POST_api_v1_ops_settings_onboarding_verifyResponse200 = {
  type: 'object',
  required: [
    'phase',
    'setupCompletedAt',
    'setupLastStep',
    'portalEnabled',
    'setupContactMode',
    'checks',
    'userFolders',
    'requiredChecksOk',
    'checksVerified',
  ],
  properties: {
    phase: {
      type: 'string',
      enum: ['pristine', 'wizard_in_progress', 'completed'],
    },
    setupCompletedAt: {
      type: ['string', 'null'],
      format: 'date-time',
    },
    setupLastStep: {
      type: 'string',
      enum: [
        'welcome',
        'practice',
        'storage',
        'contacts',
        'messaging',
        'portal',
        'summary',
        'verify',
      ],
    },
    portalEnabled: {
      type: 'boolean',
    },
    setupContactMode: {
      type: 'string',
      enum: ['unset', 'sample', 'own'],
    },
    checks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'ok', 'required', 'hint'],
        properties: {
          id: {
            type: 'string',
          },
          ok: {
            type: 'boolean',
          },
          required: {
            type: 'boolean',
          },
          hint: {
            type: ['string', 'null'],
          },
        },
      },
    },
    userFolders: {
      type: 'object',
      required: ['imports', 'exports'],
      properties: {
        imports: {
          type: 'string',
        },
        exports: {
          type: 'string',
        },
      },
    },
    requiredChecksOk: {
      type: 'boolean',
    },
    checksVerified: {
      type: 'boolean',
    },
  },
} as const;

export const POST_api_v1_ops_settings_onboarding_verifyResponse403 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'VISIT_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const GET_api_v1_ops_settings_onboardingResponse200 = {
  type: 'object',
  required: [
    'phase',
    'setupCompletedAt',
    'setupLastStep',
    'portalEnabled',
    'setupContactMode',
    'checks',
    'userFolders',
    'requiredChecksOk',
    'checksVerified',
  ],
  properties: {
    phase: {
      type: 'string',
      enum: ['pristine', 'wizard_in_progress', 'completed'],
    },
    setupCompletedAt: {
      type: ['string', 'null'],
      format: 'date-time',
    },
    setupLastStep: {
      type: 'string',
      enum: [
        'welcome',
        'practice',
        'storage',
        'contacts',
        'messaging',
        'portal',
        'summary',
        'verify',
      ],
    },
    portalEnabled: {
      type: 'boolean',
    },
    setupContactMode: {
      type: 'string',
      enum: ['unset', 'sample', 'own'],
    },
    checks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'ok', 'required', 'hint'],
        properties: {
          id: {
            type: 'string',
          },
          ok: {
            type: 'boolean',
          },
          required: {
            type: 'boolean',
          },
          hint: {
            type: ['string', 'null'],
          },
        },
      },
    },
    userFolders: {
      type: 'object',
      required: ['imports', 'exports'],
      properties: {
        imports: {
          type: 'string',
        },
        exports: {
          type: 'string',
        },
      },
    },
    requiredChecksOk: {
      type: 'boolean',
    },
    checksVerified: {
      type: 'boolean',
    },
  },
} as const;

export const PATCH_api_v1_ops_settings_onboardingRequestBody = {
  type: 'object',
  minProperties: 1,
  additionalProperties: false,
  properties: {
    setupLastStep: {
      type: 'string',
      enum: [
        'welcome',
        'practice',
        'storage',
        'contacts',
        'messaging',
        'portal',
        'summary',
        'verify',
      ],
    },
    portalEnabled: {
      type: 'boolean',
    },
    setupContactMode: {
      type: 'string',
      enum: ['unset', 'sample', 'own'],
    },
    reopenOnboarding: {
      type: 'boolean',
      const: true,
    },
    completeOnboarding: {
      type: 'boolean',
      const: true,
    },
  },
} as const;

export const PATCH_api_v1_ops_settings_onboardingResponse200 = {
  type: 'object',
  required: [
    'phase',
    'setupCompletedAt',
    'setupLastStep',
    'portalEnabled',
    'setupContactMode',
    'checks',
    'userFolders',
    'requiredChecksOk',
    'checksVerified',
  ],
  properties: {
    phase: {
      type: 'string',
      enum: ['pristine', 'wizard_in_progress', 'completed'],
    },
    setupCompletedAt: {
      type: ['string', 'null'],
      format: 'date-time',
    },
    setupLastStep: {
      type: 'string',
      enum: [
        'welcome',
        'practice',
        'storage',
        'contacts',
        'messaging',
        'portal',
        'summary',
        'verify',
      ],
    },
    portalEnabled: {
      type: 'boolean',
    },
    setupContactMode: {
      type: 'string',
      enum: ['unset', 'sample', 'own'],
    },
    checks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'ok', 'required', 'hint'],
        properties: {
          id: {
            type: 'string',
          },
          ok: {
            type: 'boolean',
          },
          required: {
            type: 'boolean',
          },
          hint: {
            type: ['string', 'null'],
          },
        },
      },
    },
    userFolders: {
      type: 'object',
      required: ['imports', 'exports'],
      properties: {
        imports: {
          type: 'string',
        },
        exports: {
          type: 'string',
        },
      },
    },
    requiredChecksOk: {
      type: 'boolean',
    },
    checksVerified: {
      type: 'boolean',
    },
  },
} as const;

export const PATCH_api_v1_ops_settings_onboardingResponse400 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'VISIT_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const PATCH_api_v1_ops_settings_onboardingResponse403 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'VISIT_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const PATCH_api_v1_ops_settings_onboardingResponse409 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'VISIT_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const GET_api_v1_ops_deployment_storageResponse200 = {
  type: 'object',
  required: ['imports', 'exports', 'serverTime'],
  properties: {
    imports: {
      type: 'object',
      required: ['containerPath', 'userFolderLabel', 'ready', 'hint', 'csvFiles', 'importFolders'],
      properties: {
        containerPath: {
          type: 'string',
        },
        userFolderLabel: {
          type: 'string',
        },
        ready: {
          type: 'boolean',
        },
        hint: {
          type: ['string', 'null'],
        },
        csvFiles: {
          type: 'array',
          items: {
            type: 'object',
            required: ['fileName', 'containerPath', 'sizeBytes', 'updatedAt'],
            properties: {
              fileName: {
                type: 'string',
              },
              containerPath: {
                type: 'string',
              },
              sizeBytes: {
                type: 'integer',
                minimum: 0,
              },
              updatedAt: {
                type: 'string',
                format: 'date-time',
              },
            },
          },
        },
        importFolders: {
          type: 'array',
          items: {
            type: 'object',
            required: ['label', 'containerPath'],
            properties: {
              label: {
                type: 'string',
              },
              containerPath: {
                type: 'string',
              },
            },
          },
        },
      },
    },
    exports: {
      type: 'object',
      required: ['containerPath', 'userFolderLabel', 'ready', 'hint', 'csvFiles', 'importFolders'],
      properties: {
        containerPath: {
          type: 'string',
        },
        userFolderLabel: {
          type: 'string',
        },
        ready: {
          type: 'boolean',
        },
        hint: {
          type: ['string', 'null'],
        },
        csvFiles: {
          type: 'array',
          items: {
            type: 'object',
            required: ['fileName', 'containerPath', 'sizeBytes', 'updatedAt'],
            properties: {
              fileName: {
                type: 'string',
              },
              containerPath: {
                type: 'string',
              },
              sizeBytes: {
                type: 'integer',
                minimum: 0,
              },
              updatedAt: {
                type: 'string',
                format: 'date-time',
              },
            },
          },
        },
        importFolders: {
          type: 'array',
          items: {
            type: 'object',
            required: ['label', 'containerPath'],
            properties: {
              label: {
                type: 'string',
              },
              containerPath: {
                type: 'string',
              },
            },
          },
        },
      },
    },
    serverTime: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const POST_api_v1_ops_contact_lookup_previewRequestBody = {
  type: 'object',
  required: [
    'contactLookupFolderPath',
    'contactLookupDelimiterMode',
    'contactLookupHasHeader',
    'contactLookupMapping',
  ],
  additionalProperties: false,
  properties: {
    contactLookupFolderPath: {
      type: 'string',
      minLength: 1,
      maxLength: 4096,
    },
    contactLookupDelimiterMode: {
      type: 'string',
      enum: ['auto', 'semicolon', 'comma', 'tab'],
    },
    contactLookupHasHeader: {
      type: 'boolean',
    },
    contactLookupMapping: {
      type: 'object',
      required: ['mobile'],
      additionalProperties: false,
      properties: {
        mobile: {
          oneOf: [
            {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            {
              type: 'integer',
              minimum: 0,
              maximum: 512,
            },
          ],
        },
        lastName: {
          oneOf: [
            {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            {
              type: 'integer',
              minimum: 0,
              maximum: 512,
            },
          ],
        },
        firstName: {
          oneOf: [
            {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            {
              type: 'integer',
              minimum: 0,
              maximum: 512,
            },
          ],
        },
        birthDate: {
          oneOf: [
            {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            {
              type: 'integer',
              minimum: 0,
              maximum: 512,
            },
          ],
        },
      },
    },
  },
} as const;

export const POST_api_v1_ops_contact_lookup_previewResponse200 = {
  type: 'object',
  required: [
    'detectedDelimiterMode',
    'layout',
    'csvFileCount',
    'patientCount',
    'columns',
    'sampleRows',
    'sampleSourceFile',
    'suggestedMapping',
    'scannedAt',
  ],
  properties: {
    detectedDelimiterMode: {
      type: 'string',
      enum: ['semicolon', 'comma', 'tab'],
    },
    layout: {
      type: 'string',
      enum: ['list', 'per_patient', 'mixed'],
    },
    csvFileCount: {
      type: 'integer',
      minimum: 0,
    },
    patientCount: {
      type: 'integer',
      minimum: 0,
    },
    columns: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    sampleRows: {
      type: 'array',
      items: {
        type: 'array',
        items: {
          type: 'string',
        },
      },
    },
    sampleSourceFile: {
      type: 'string',
    },
    scannedAt: {
      type: 'string',
      format: 'date-time',
    },
    suggestedMapping: {
      type: 'object',
      additionalProperties: false,
      properties: {
        mobile: {
          oneOf: [
            {
              type: 'string',
            },
            {
              type: 'integer',
            },
          ],
        },
        lastName: {
          oneOf: [
            {
              type: 'string',
            },
            {
              type: 'integer',
            },
          ],
        },
        firstName: {
          oneOf: [
            {
              type: 'string',
            },
            {
              type: 'integer',
            },
          ],
        },
        birthDate: {
          oneOf: [
            {
              type: 'string',
            },
            {
              type: 'integer',
            },
          ],
        },
      },
    },
  },
} as const;

export const POST_api_v1_ops_contact_lookup_previewResponse400 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'VISIT_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const POST_api_v1_ops_contact_lookup_validateRequestBody = {
  type: 'object',
  required: [
    'contactLookupFolderPath',
    'contactLookupDelimiterMode',
    'contactLookupHasHeader',
    'contactLookupMapping',
  ],
  additionalProperties: false,
  properties: {
    contactLookupFolderPath: {
      type: 'string',
      minLength: 1,
      maxLength: 4096,
    },
    contactLookupDelimiterMode: {
      type: 'string',
      enum: ['auto', 'semicolon', 'comma', 'tab'],
    },
    contactLookupHasHeader: {
      type: 'boolean',
    },
    contactLookupMapping: {
      type: 'object',
      required: ['mobile'],
      additionalProperties: false,
      properties: {
        mobile: {
          oneOf: [
            {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            {
              type: 'integer',
              minimum: 0,
              maximum: 512,
            },
          ],
        },
        lastName: {
          oneOf: [
            {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            {
              type: 'integer',
              minimum: 0,
              maximum: 512,
            },
          ],
        },
        firstName: {
          oneOf: [
            {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            {
              type: 'integer',
              minimum: 0,
              maximum: 512,
            },
          ],
        },
        birthDate: {
          oneOf: [
            {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            {
              type: 'integer',
              minimum: 0,
              maximum: 512,
            },
          ],
        },
      },
    },
  },
} as const;

export const POST_api_v1_ops_contact_lookup_validateResponse200 = {
  type: 'object',
  required: ['ok', 'detectedDelimiterMode', 'layout', 'csvFileCount', 'patientCount', 'sampleRows'],
  properties: {
    ok: {
      type: 'boolean',
      const: true,
    },
    detectedDelimiterMode: {
      type: 'string',
      enum: ['semicolon', 'comma', 'tab'],
    },
    layout: {
      type: 'string',
      enum: ['list', 'per_patient', 'mixed'],
    },
    csvFileCount: {
      type: 'integer',
      minimum: 0,
    },
    patientCount: {
      type: 'integer',
      minimum: 0,
    },
    sampleRows: {
      type: 'integer',
      minimum: 0,
    },
  },
} as const;

export const POST_api_v1_ops_contact_lookup_validateResponse400 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'VISIT_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const POST_api_v1_ops_contact_lookup_apply_demoResponse200 = {
  type: 'object',
  required: [
    'phase',
    'setupCompletedAt',
    'setupLastStep',
    'portalEnabled',
    'setupContactMode',
    'checks',
    'userFolders',
    'requiredChecksOk',
    'checksVerified',
  ],
  properties: {
    phase: {
      type: 'string',
      enum: ['pristine', 'wizard_in_progress', 'completed'],
    },
    setupCompletedAt: {
      type: ['string', 'null'],
      format: 'date-time',
    },
    setupLastStep: {
      type: 'string',
      enum: [
        'welcome',
        'practice',
        'storage',
        'contacts',
        'messaging',
        'portal',
        'summary',
        'verify',
      ],
    },
    portalEnabled: {
      type: 'boolean',
    },
    setupContactMode: {
      type: 'string',
      enum: ['unset', 'sample', 'own'],
    },
    checks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'ok', 'required', 'hint'],
        properties: {
          id: {
            type: 'string',
          },
          ok: {
            type: 'boolean',
          },
          required: {
            type: 'boolean',
          },
          hint: {
            type: ['string', 'null'],
          },
        },
      },
    },
    userFolders: {
      type: 'object',
      required: ['imports', 'exports'],
      properties: {
        imports: {
          type: 'string',
        },
        exports: {
          type: 'string',
        },
      },
    },
    requiredChecksOk: {
      type: 'boolean',
    },
    checksVerified: {
      type: 'boolean',
    },
  },
} as const;

export const GET_api_v1_ops_messaging_providersResponse200 = {
  type: 'object',
  required: ['channels'],
  properties: {
    channels: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'providers'],
        properties: {
          id: {
            type: 'string',
            enum: ['sms', 'messenger'],
          },
          providers: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'label', 'channel', 'configured', 'enabled', 'requires'],
              properties: {
                id: {
                  type: 'string',
                },
                label: {
                  type: 'string',
                },
                channel: {
                  type: 'string',
                  enum: ['sms', 'messenger'],
                },
                configured: {
                  type: 'boolean',
                },
                enabled: {
                  type: 'boolean',
                },
                requires: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

export const PATCH_api_v1_ops_messaging_providers_providerId_Params = {
  type: 'object',
  required: ['providerId'],
  additionalProperties: false,
  properties: {
    providerId: {
      type: 'string',
      enum: ['mock', 'seven', 'seven_whatsapp'],
    },
  },
} as const;

export const PATCH_api_v1_ops_messaging_providers_providerId_RequestBody = {
  type: 'object',
  minProperties: 1,
  additionalProperties: false,
  properties: {
    enabled: {
      type: 'boolean',
    },
    credentials: {
      type: 'object',
      additionalProperties: {
        type: 'string',
        minLength: 1,
        maxLength: 2048,
      },
    },
  },
} as const;

export const PATCH_api_v1_ops_messaging_providers_providerId_Response200 = {
  type: 'object',
  required: ['id', 'label', 'channel', 'configured', 'enabled', 'requires'],
  properties: {
    id: {
      type: 'string',
      enum: ['mock', 'seven', 'seven_whatsapp'],
    },
    label: {
      type: 'string',
    },
    channel: {
      type: 'string',
      enum: ['sms', 'messenger'],
    },
    configured: {
      type: 'boolean',
    },
    enabled: {
      type: 'boolean',
    },
    requires: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
  },
} as const;

export const PATCH_api_v1_ops_messaging_providers_providerId_Response400 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'VISIT_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const GET_api_v1_ops_maintenance_runtime_reset_previewResponse200 = {
  type: 'object',
  required: [
    'ticketCount',
    'outboxEventCount',
    'emergencyActive',
    'preservedTopicCount',
    'preservedRoomCount',
    'confirmPhrase',
    'serverTime',
  ],
  properties: {
    visitCount: {
      type: 'integer',
      minimum: 0,
    },
    outboxEventCount: {
      type: 'integer',
      minimum: 0,
    },
    emergencyActive: {
      type: 'boolean',
    },
    preservedTopicCount: {
      type: 'integer',
      minimum: 0,
    },
    preservedRoomCount: {
      type: 'integer',
      minimum: 0,
    },
    confirmPhrase: {
      type: 'string',
    },
    serverTime: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const POST_api_v1_ops_maintenance_runtime_resetRequestBody = {
  type: 'object',
  required: ['confirmPhrase'],
  additionalProperties: false,
  properties: {
    confirmPhrase: {
      type: 'string',
      minLength: 1,
      maxLength: 64,
    },
  },
} as const;

export const POST_api_v1_ops_maintenance_runtime_resetResponse200 = {
  type: 'object',
  required: [
    'resetVisitCount',
    'clearedOutboxCount',
    'emergencyCleared',
    'preservedTopicCount',
    'preservedRoomCount',
    'checkinLocked',
    'dayClosePhase',
    'lastResetBusinessDay',
    'updatedAt',
    'sandboxRestartRequired',
    'sandboxRestartInitiated',
  ],
  properties: {
    resetVisitCount: {
      type: 'integer',
      minimum: 0,
    },
    clearedOutboxCount: {
      type: 'integer',
      minimum: 0,
    },
    emergencyCleared: {
      type: 'boolean',
    },
    preservedTopicCount: {
      type: 'integer',
      minimum: 0,
    },
    preservedRoomCount: {
      type: 'integer',
      minimum: 0,
    },
    checkinLocked: {
      type: 'boolean',
      const: true,
    },
    dayClosePhase: {
      type: 'string',
      enum: ['open', 'started'],
    },
    lastResetBusinessDay: {
      type: 'string',
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
    sandboxRestartRequired: {
      type: 'boolean',
      const: true,
    },
    sandboxRestartInitiated: {
      type: 'boolean',
      const: true,
    },
  },
} as const;

export const POST_api_v1_ops_maintenance_runtime_resetResponse400 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'VISIT_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const GET_api_v1_ops_outbox_statusResponse200 = {
  type: 'object',
  required: [
    'readyCount',
    'retryScheduledCount',
    'deadLetterCount',
    'oldestPendingCreatedAt',
    'serverTime',
  ],
  properties: {
    readyCount: {
      type: 'integer',
    },
    retryScheduledCount: {
      type: 'integer',
    },
    deadLetterCount: {
      type: 'integer',
    },
    oldestPendingCreatedAt: {
      type: ['string', 'null'],
      format: 'date-time',
    },
    serverTime: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const GET_api_v1_ops_day_lifecycleResponse200 = {
  type: 'object',
  required: [
    'businessDay',
    'lastResetBusinessDay',
    'needsDayStartHint',
    'checkinLocked',
    'dayClosePhase',
    'lastDayStats',
  ],
  properties: {
    businessDay: {
      type: 'string',
    },
    lastResetBusinessDay: {
      type: 'string',
    },
    needsDayStartHint: {
      type: 'boolean',
    },
    checkinLocked: {
      type: 'boolean',
    },
    dayClosePhase: {
      type: 'string',
      enum: ['open', 'started'],
    },
    lastDayStats: {
      oneOf: [
        {
          type: 'null',
        },
        {
          type: 'object',
          required: ['businessDay', 'totalVisits', 'maxWaitMs', 'byTopic', 'openVisits'],
          properties: {
            businessDay: {
              type: 'string',
            },
            totalVisits: {
              type: 'integer',
            },
            maxWaitMs: {
              type: 'integer',
            },
            byTopic: {
              type: 'array',
              items: {
                type: 'object',
                required: ['topicId', 'topicLabel', 'count'],
                properties: {
                  topicId: {
                    type: 'string',
                  },
                  topicLabel: {
                    type: 'string',
                  },
                  count: {
                    type: 'integer',
                  },
                },
              },
            },
            openVisits: {
              type: 'array',
              items: {
                type: 'object',
                required: ['visitId', 'laneCode', 'number', 'topicLabel', 'identityRef', 'status'],
                properties: {
                  visitId: {
                    type: 'string',
                  },
                  laneCode: {
                    type: 'string',
                  },
                  number: {
                    type: 'integer',
                  },
                  topicLabel: {
                    type: 'string',
                  },
                  identityRef: {
                    type: ['string', 'null'],
                  },
                  status: {
                    type: 'string',
                    enum: [
                      'waiting',
                      'called',
                      'in_room',
                      'absent_wait_here',
                      'absent_return_later',
                    ],
                  },
                },
              },
            },
          },
        },
      ],
    },
  },
} as const;

export const POST_api_v1_ops_day_lifecycle_resetRequestBody = {
  type: 'object',
  required: ['confirmBusinessDayReset'],
  additionalProperties: false,
  properties: {
    confirmBusinessDayReset: {
      type: 'boolean',
      const: true,
    },
  },
} as const;

export const POST_api_v1_ops_day_lifecycle_resetResponse200 = {
  type: 'object',
  required: [
    'dayClosePhase',
    'resetVisitCount',
    'updatedAt',
    'lastResetBusinessDay',
    'sandboxRestartRequired',
    'sandboxRestartInitiated',
  ],
  properties: {
    dayClosePhase: {
      type: 'string',
      enum: ['open', 'started'],
    },
    resetVisitCount: {
      type: 'integer',
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
    lastResetBusinessDay: {
      type: 'string',
    },
    sandboxRestartRequired: {
      type: 'boolean',
      const: true,
    },
    sandboxRestartInitiated: {
      type: 'boolean',
      const: true,
    },
  },
} as const;

export const POST_api_v1_ops_day_lifecycle_resetResponse400 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'VISIT_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const POST_api_v1_ops_device_presenceRequestBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    deviceId: {
      type: 'string',
      minLength: 1,
      maxLength: 64,
    },
    clientTime: {
      type: 'string',
      format: 'date-time',
    },
    lastRevision: {
      type: 'integer',
      minimum: 0,
    },
  },
} as const;

export const GET_api_v1_ops_device_streamResponse403 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'VISIT_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const POST_api_v1_ops_emergency_raiseResponse200 = {
  type: 'object',
  required: ['emergencyId', 'status', 'raisedAt', 'alreadyActive'],
  properties: {
    emergencyId: {
      type: 'string',
      minLength: 1,
    },
    status: {
      type: 'string',
      const: 'raised',
    },
    raisedAt: {
      type: 'string',
      format: 'date-time',
    },
    alreadyActive: {
      type: 'boolean',
    },
  },
} as const;

export const POST_api_v1_ops_emergency_raiseResponse409 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'VISIT_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const POST_api_v1_ops_emergency_ackRequestBody = {
  type: 'object',
  required: ['emergencyId', 'uiDisplayed'],
  additionalProperties: false,
  properties: {
    emergencyId: {
      type: 'string',
      minLength: 1,
      maxLength: 128,
    },
    uiDisplayed: {
      type: 'boolean',
      const: true,
    },
  },
} as const;

export const POST_api_v1_ops_emergency_ackResponse200 = {
  type: 'object',
  required: ['emergencyId', 'status', 'raisedAt', 'acknowledgedAt', 'uiDisplayed'],
  properties: {
    emergencyId: {
      type: 'string',
      minLength: 1,
    },
    status: {
      type: 'string',
      const: 'acknowledged',
    },
    raisedAt: {
      type: 'string',
      format: 'date-time',
    },
    acknowledgedAt: {
      type: 'string',
      format: 'date-time',
    },
    uiDisplayed: {
      type: 'boolean',
      const: true,
    },
  },
} as const;

export const POST_api_v1_ops_emergency_ackResponse404 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'VISIT_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const POST_api_v1_ops_checkin_lockRequestBody = {
  type: 'object',
  required: ['locked'],
  properties: {
    locked: {
      type: 'boolean',
    },
  },
} as const;

export const POST_api_v1_ops_checkin_lockResponse200 = {
  type: 'object',
  required: ['checkinLocked', 'dayClosePhase', 'updatedAt'],
  properties: {
    checkinLocked: {
      type: 'boolean',
    },
    dayClosePhase: {
      type: 'string',
      enum: ['open', 'started'],
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const POST_api_v1_ops_checkin_lockResponse400 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'VISIT_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const POST_api_v1_ops_checkin_lockResponse409 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'VISIT_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const POST_api_v1_ops_day_close_startResponse200 = {
  type: 'object',
  required: ['checkinLocked', 'dayClosePhase', 'updatedAt'],
  properties: {
    checkinLocked: {
      type: 'boolean',
    },
    dayClosePhase: {
      type: 'string',
      enum: ['open', 'started'],
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const POST_api_v1_ops_day_close_startResponse400 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'VISIT_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const POST_api_v1_ops_day_close_startResponse409 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'VISIT_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const opsSchemas = {
  OpsStateResponse,
  BusinessDayResetResponse,
  BusinessDayResetRequest,
  RuntimeResetPreviewResponse,
  RuntimeResetRequest,
  RuntimeResetResponse,
  TerminalPatientLocale,
  TerminalPatientLocales,
  OpsPatientLocalesResponse,
  OpsHeartbeatResponse,
  OpsOnboardingStatus,
  PracticeProfile,
  OpsSettingsResponse,
  RoutingCapabilitiesResponse,
  DeploymentVolumeStatus,
  DeploymentStorageResponse,
  ContactLookupValidateRequest,
  ContactLookupValidateResponse,
  ContactLookupPreviewResponse,
  OutboxStatusResponse,
  DayLifecycleResponse,
  DevicePresenceRequest,
  EmergencyRaiseResponse,
  EmergencyAcknowledgeRequest,
  EmergencyAcknowledgeResponse,
  MessagingProviderCatalogResponse,
  GET_api_v1_ops_healthResponse200,
  GET_api_v1_practice_profileResponse200,
  GET_api_v1_ops_patient_localesResponse200,
  GET_api_v1_ops_heartbeatResponse200,
  GET_api_v1_ops_settingsResponse200,
  PATCH_api_v1_ops_settingsRequestBody,
  PATCH_api_v1_ops_settingsResponse200,
  PATCH_api_v1_ops_settingsResponse400,
  PATCH_api_v1_ops_settingsResponse403,
  GET_api_v1_ops_settings_capabilitiesResponse200,
  POST_api_v1_ops_settings_onboarding_verifyResponse200,
  POST_api_v1_ops_settings_onboarding_verifyResponse403,
  GET_api_v1_ops_settings_onboardingResponse200,
  PATCH_api_v1_ops_settings_onboardingRequestBody,
  PATCH_api_v1_ops_settings_onboardingResponse200,
  PATCH_api_v1_ops_settings_onboardingResponse400,
  PATCH_api_v1_ops_settings_onboardingResponse403,
  PATCH_api_v1_ops_settings_onboardingResponse409,
  GET_api_v1_ops_deployment_storageResponse200,
  POST_api_v1_ops_contact_lookup_previewRequestBody,
  POST_api_v1_ops_contact_lookup_previewResponse200,
  POST_api_v1_ops_contact_lookup_previewResponse400,
  POST_api_v1_ops_contact_lookup_validateRequestBody,
  POST_api_v1_ops_contact_lookup_validateResponse200,
  POST_api_v1_ops_contact_lookup_validateResponse400,
  POST_api_v1_ops_contact_lookup_apply_demoResponse200,
  GET_api_v1_ops_messaging_providersResponse200,
  PATCH_api_v1_ops_messaging_providers_providerId_Params,
  PATCH_api_v1_ops_messaging_providers_providerId_RequestBody,
  PATCH_api_v1_ops_messaging_providers_providerId_Response200,
  PATCH_api_v1_ops_messaging_providers_providerId_Response400,
  GET_api_v1_ops_maintenance_runtime_reset_previewResponse200,
  POST_api_v1_ops_maintenance_runtime_resetRequestBody,
  POST_api_v1_ops_maintenance_runtime_resetResponse200,
  POST_api_v1_ops_maintenance_runtime_resetResponse400,
  GET_api_v1_ops_outbox_statusResponse200,
  GET_api_v1_ops_day_lifecycleResponse200,
  POST_api_v1_ops_day_lifecycle_resetRequestBody,
  POST_api_v1_ops_day_lifecycle_resetResponse200,
  POST_api_v1_ops_day_lifecycle_resetResponse400,
  POST_api_v1_ops_device_presenceRequestBody,
  GET_api_v1_ops_device_streamResponse403,
  POST_api_v1_ops_emergency_raiseResponse200,
  POST_api_v1_ops_emergency_raiseResponse409,
  POST_api_v1_ops_emergency_ackRequestBody,
  POST_api_v1_ops_emergency_ackResponse200,
  POST_api_v1_ops_emergency_ackResponse404,
  POST_api_v1_ops_checkin_lockRequestBody,
  POST_api_v1_ops_checkin_lockResponse200,
  POST_api_v1_ops_checkin_lockResponse400,
  POST_api_v1_ops_checkin_lockResponse409,
  POST_api_v1_ops_day_close_startResponse200,
  POST_api_v1_ops_day_close_startResponse400,
  POST_api_v1_ops_day_close_startResponse409,
} as const;
