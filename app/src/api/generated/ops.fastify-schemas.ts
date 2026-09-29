/**
 * AUTO-GENERATED from openapi/ops.yaml — do not edit.
 * Run: npm run generate:api-schemas
 */

export const RoomPanelPlacementConfig = {
  type: 'object',
  required: [
    'enabled',
    'mode',
    'showPatientNames',
    'allowCalling',
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
    mode: {
      type: 'string',
      enum: ['display_only', 'arrival', 'staff_full'],
    },
    showPatientNames: {
      type: 'boolean',
    },
    allowCalling: {
      type: 'boolean',
    },
    calledTextPreset: {
      type: 'string',
      enum: ['you_are_right', 'please_wait_here', 'please_enter', 'go_to_reception', 'custom'],
    },
    calledTextCustom: {
      type: ['string', 'null'],
      maxLength: 80,
    },
    arrivedTextPreset: {
      type: 'string',
      enum: ['you_are_right', 'please_wait_here', 'please_enter', 'go_to_reception', 'custom'],
    },
    arrivedTextCustom: {
      type: ['string', 'null'],
      maxLength: 80,
    },
  },
} as const;

export const RoomPanelsSettings = {
  type: 'object',
  required: ['outside', 'inside'],
  additionalProperties: false,
  properties: {
    outside: {
      type: 'object',
      required: [
        'enabled',
        'mode',
        'showPatientNames',
        'allowCalling',
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
        mode: {
          type: 'string',
          enum: ['display_only', 'arrival', 'staff_full'],
        },
        showPatientNames: {
          type: 'boolean',
        },
        allowCalling: {
          type: 'boolean',
        },
        calledTextPreset: {
          type: 'string',
          enum: ['you_are_right', 'please_wait_here', 'please_enter', 'go_to_reception', 'custom'],
        },
        calledTextCustom: {
          type: ['string', 'null'],
          maxLength: 80,
        },
        arrivedTextPreset: {
          type: 'string',
          enum: ['you_are_right', 'please_wait_here', 'please_enter', 'go_to_reception', 'custom'],
        },
        arrivedTextCustom: {
          type: ['string', 'null'],
          maxLength: 80,
        },
      },
    },
    inside: {
      type: 'object',
      required: [
        'enabled',
        'mode',
        'showPatientNames',
        'allowCalling',
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
        mode: {
          type: 'string',
          enum: ['display_only', 'arrival', 'staff_full'],
        },
        showPatientNames: {
          type: 'boolean',
        },
        allowCalling: {
          type: 'boolean',
        },
        calledTextPreset: {
          type: 'string',
          enum: ['you_are_right', 'please_wait_here', 'please_enter', 'go_to_reception', 'custom'],
        },
        calledTextCustom: {
          type: ['string', 'null'],
          maxLength: 80,
        },
        arrivedTextPreset: {
          type: 'string',
          enum: ['you_are_right', 'please_wait_here', 'please_enter', 'go_to_reception', 'custom'],
        },
        arrivedTextCustom: {
          type: ['string', 'null'],
          maxLength: 80,
        },
      },
    },
  },
} as const;

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
    'visitCount',
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

export const JourneyStepSetting = {
  type: 'object',
  required: ['id', 'sortOrder', 'movementMode', 'publicDisplayMode', 'completedWhen'],
  additionalProperties: false,
  properties: {
    id: {
      type: 'string',
      minLength: 1,
      maxLength: 128,
    },
    sortOrder: {
      type: 'integer',
      minimum: 0,
      maximum: 99,
    },
    targetLocationId: {
      type: ['string', 'null'],
      minLength: 1,
      maxLength: 64,
    },
    queueId: {
      type: ['string', 'null'],
      minLength: 1,
      maxLength: 64,
    },
    movementMode: {
      type: 'string',
      enum: ['call', 'self_go', 'pickup'],
    },
    publicDisplayMode: {
      type: 'string',
      enum: ['visible', 'hidden', 'call_only'],
    },
    completedWhen: {
      type: 'string',
      enum: ['arrive', 'start', 'done'],
    },
    instructionText: {
      type: ['string', 'null'],
      maxLength: 256,
    },
  },
} as const;

export const JourneyTemplateSetting = {
  type: 'object',
  required: ['id', 'name', 'active', 'steps'],
  additionalProperties: false,
  properties: {
    id: {
      type: 'string',
      minLength: 1,
      maxLength: 128,
      pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
    },
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 128,
    },
    topicId: {
      type: ['string', 'null'],
      minLength: 1,
      maxLength: 64,
    },
    active: {
      type: 'boolean',
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'sortOrder', 'movementMode', 'publicDisplayMode', 'completedWhen'],
        additionalProperties: false,
        properties: {
          id: {
            type: 'string',
            minLength: 1,
            maxLength: 128,
          },
          sortOrder: {
            type: 'integer',
            minimum: 0,
            maximum: 99,
          },
          targetLocationId: {
            type: ['string', 'null'],
            minLength: 1,
            maxLength: 64,
          },
          queueId: {
            type: ['string', 'null'],
            minLength: 1,
            maxLength: 64,
          },
          movementMode: {
            type: 'string',
            enum: ['call', 'self_go', 'pickup'],
          },
          publicDisplayMode: {
            type: 'string',
            enum: ['visible', 'hidden', 'call_only'],
          },
          completedWhen: {
            type: 'string',
            enum: ['arrive', 'start', 'done'],
          },
          instructionText: {
            type: ['string', 'null'],
            maxLength: 256,
          },
        },
      },
    },
  },
} as const;

export const JourneySettings = {
  type: 'object',
  required: ['templates'],
  additionalProperties: false,
  properties: {
    templates: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'name', 'active', 'steps'],
        additionalProperties: false,
        properties: {
          id: {
            type: 'string',
            minLength: 1,
            maxLength: 128,
            pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
          },
          name: {
            type: 'string',
            minLength: 1,
            maxLength: 128,
          },
          topicId: {
            type: ['string', 'null'],
            minLength: 1,
            maxLength: 64,
          },
          active: {
            type: 'boolean',
          },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'sortOrder', 'movementMode', 'publicDisplayMode', 'completedWhen'],
              additionalProperties: false,
              properties: {
                id: {
                  type: 'string',
                  minLength: 1,
                  maxLength: 128,
                },
                sortOrder: {
                  type: 'integer',
                  minimum: 0,
                  maximum: 99,
                },
                targetLocationId: {
                  type: ['string', 'null'],
                  minLength: 1,
                  maxLength: 64,
                },
                queueId: {
                  type: ['string', 'null'],
                  minLength: 1,
                  maxLength: 64,
                },
                movementMode: {
                  type: 'string',
                  enum: ['call', 'self_go', 'pickup'],
                },
                publicDisplayMode: {
                  type: 'string',
                  enum: ['visible', 'hidden', 'call_only'],
                },
                completedWhen: {
                  type: 'string',
                  enum: ['arrive', 'start', 'done'],
                },
                instructionText: {
                  type: ['string', 'null'],
                  maxLength: 256,
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

export const OpsSettingsResponse = {
  type: 'object',
  required: [
    'routingMode',
    'postWaitingCallTargetId',
    'returnWindowMinutes',
    'practiceOpenFrom',
    'practiceOpenTo',
    'topics',
    'journeySettings',
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
    postWaitingCallTargetId: {
      type: ['string', 'null'],
      minLength: 1,
      maxLength: 64,
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
          journeyTemplateId: {
            type: ['string', 'null'],
            minLength: 1,
            maxLength: 128,
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
    journeySettings: {
      type: 'object',
      required: ['templates'],
      additionalProperties: false,
      properties: {
        templates: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'name', 'active', 'steps'],
            additionalProperties: false,
            properties: {
              id: {
                type: 'string',
                minLength: 1,
                maxLength: 128,
                pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
              },
              name: {
                type: 'string',
                minLength: 1,
                maxLength: 128,
              },
              topicId: {
                type: ['string', 'null'],
                minLength: 1,
                maxLength: 64,
              },
              active: {
                type: 'boolean',
              },
              steps: {
                type: 'array',
                items: {
                  type: 'object',
                  required: [
                    'id',
                    'sortOrder',
                    'movementMode',
                    'publicDisplayMode',
                    'completedWhen',
                  ],
                  additionalProperties: false,
                  properties: {
                    id: {
                      type: 'string',
                      minLength: 1,
                      maxLength: 128,
                    },
                    sortOrder: {
                      type: 'integer',
                      minimum: 0,
                      maximum: 99,
                    },
                    targetLocationId: {
                      type: ['string', 'null'],
                      minLength: 1,
                      maxLength: 64,
                    },
                    queueId: {
                      type: ['string', 'null'],
                      minLength: 1,
                      maxLength: 64,
                    },
                    movementMode: {
                      type: 'string',
                      enum: ['call', 'self_go', 'pickup'],
                    },
                    publicDisplayMode: {
                      type: 'string',
                      enum: ['visible', 'hidden', 'call_only'],
                    },
                    completedWhen: {
                      type: 'string',
                      enum: ['arrive', 'start', 'done'],
                    },
                    instructionText: {
                      type: ['string', 'null'],
                      maxLength: 256,
                    },
                  },
                },
              },
            },
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
          panels: {
            type: 'object',
            required: ['outside', 'inside'],
            additionalProperties: false,
            properties: {
              outside: {
                type: 'object',
                required: [
                  'enabled',
                  'mode',
                  'showPatientNames',
                  'allowCalling',
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
                  mode: {
                    type: 'string',
                    enum: ['display_only', 'arrival', 'staff_full'],
                  },
                  showPatientNames: {
                    type: 'boolean',
                  },
                  allowCalling: {
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
              inside: {
                type: 'object',
                required: [
                  'enabled',
                  'mode',
                  'showPatientNames',
                  'allowCalling',
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
                  mode: {
                    type: 'string',
                    enum: ['display_only', 'arrival', 'staff_full'],
                  },
                  showPatientNames: {
                    type: 'boolean',
                  },
                  allowCalling: {
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
  required: ['routingMode', 'openVisitCount', 'features'],
  additionalProperties: false,
  properties: {
    routingMode: {
      type: 'string',
      enum: ['simple', 'complex'],
    },
    openVisitCount: {
      type: 'integer',
      minimum: 0,
    },
    features: {
      type: 'object',
      required: ['complexRouting', 'journeyDesigner', 'routingSimulator', 'complexRoutingLicensed'],
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
        complexRoutingLicensed: {
          type: 'boolean',
        },
      },
    },
  },
} as const;

export const SettingsSnapshotAuthSettingsV1 = {
  type: 'object',
  required: ['staffPinHashMfa', 'staffPinHashOps', 'roomPanelPinHash'],
  additionalProperties: false,
  properties: {
    staffPinHashMfa: {
      type: 'string',
    },
    staffPinHashOps: {
      type: 'string',
    },
    roomPanelPinHash: {
      type: 'string',
    },
  },
} as const;

export const SettingsSnapshotMessagingProviderConfigV1 = {
  type: 'object',
  required: ['providerId', 'channel', 'enabled', 'credentialsJson'],
  additionalProperties: false,
  properties: {
    providerId: {
      type: 'string',
    },
    channel: {
      type: 'string',
      enum: ['sms', 'messenger'],
    },
    enabled: {
      type: 'boolean',
    },
    credentialsJson: {
      type: 'string',
    },
  },
} as const;

export const SettingsSnapshotOpsSettingsV1 = {
  type: 'object',
  additionalProperties: true,
} as const;

export const SettingsSnapshotDbV1 = {
  type: 'object',
  required: [
    'settingsFormatVersion',
    'exportedAt',
    'opsSettings',
    'authSettings',
    'messagingProviderConfigs',
  ],
  additionalProperties: false,
  properties: {
    settingsFormatVersion: {
      type: 'integer',
      const: 1,
    },
    exportedAt: {
      type: 'string',
      format: 'date-time',
    },
    opsSettings: {
      type: 'object',
      additionalProperties: true,
    },
    authSettings: {
      type: 'object',
      required: ['staffPinHashMfa', 'staffPinHashOps', 'roomPanelPinHash'],
      additionalProperties: false,
      properties: {
        staffPinHashMfa: {
          type: 'string',
        },
        staffPinHashOps: {
          type: 'string',
        },
        roomPanelPinHash: {
          type: 'string',
        },
      },
    },
    messagingProviderConfigs: {
      type: 'array',
      items: {
        type: 'object',
        required: ['providerId', 'channel', 'enabled', 'credentialsJson'],
        additionalProperties: false,
        properties: {
          providerId: {
            type: 'string',
          },
          channel: {
            type: 'string',
            enum: ['sms', 'messenger'],
          },
          enabled: {
            type: 'boolean',
          },
          credentialsJson: {
            type: 'string',
          },
        },
      },
    },
  },
} as const;

export const SettingsSnapshotV1 = {
  type: 'object',
  required: [
    'settingsFormatVersion',
    'exportedAt',
    'opsSettings',
    'authSettings',
    'messagingProviderConfigs',
  ],
  additionalProperties: false,
  properties: {
    settingsFormatVersion: {
      type: 'integer',
      const: 1,
    },
    exportedAt: {
      type: 'string',
      format: 'date-time',
    },
    opsSettings: {
      type: 'object',
      additionalProperties: true,
    },
    authSettings: {
      type: 'object',
      required: ['staffPinHashMfa', 'staffPinHashOps', 'roomPanelPinHash'],
      additionalProperties: false,
      properties: {
        staffPinHashMfa: {
          type: 'string',
        },
        staffPinHashOps: {
          type: 'string',
        },
        roomPanelPinHash: {
          type: 'string',
        },
      },
    },
    messagingProviderConfigs: {
      type: 'array',
      items: {
        type: 'object',
        required: ['providerId', 'channel', 'enabled', 'credentialsJson'],
        additionalProperties: false,
        properties: {
          providerId: {
            type: 'string',
          },
          channel: {
            type: 'string',
            enum: ['sms', 'messenger'],
          },
          enabled: {
            type: 'boolean',
          },
          credentialsJson: {
            type: 'string',
          },
        },
      },
    },
    env: {
      type: 'object',
      additionalProperties: {
        type: 'string',
      },
    },
  },
} as const;

export const MaintenanceApiInfo = {
  type: 'object',
  required: [
    'protocolVersion',
    'stackVersion',
    'snapshotExportFormatVersion',
    'snapshotImportFormatVersions',
  ],
  additionalProperties: false,
  properties: {
    protocolVersion: {
      type: 'integer',
      const: 1,
    },
    stackVersion: {
      type: ['string', 'null'],
    },
    snapshotExportFormatVersion: {
      type: 'integer',
    },
    snapshotImportFormatVersions: {
      type: 'array',
      items: {
        type: 'integer',
      },
    },
  },
} as const;

export const SettingsSnapshotValidationResult = {
  type: 'object',
  required: ['ok', 'errors'],
  additionalProperties: false,
  properties: {
    ok: {
      type: 'boolean',
    },
    errors: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    code: {
      type: 'string',
      enum: [
        'UNKNOWN_FORMAT_VERSION',
        'INVALID_SNAPSHOT',
        'OPS_SETTINGS_INVALID',
        'CATALOG_INTEGRITY_FAILED',
        'IMPORT_FAILED',
      ],
    },
  },
} as const;

export const DeviceAuthorizationCopyRow = {
  type: 'object',
  additionalProperties: false,
  required: [
    'authorizationId',
    'role',
    'deviceId',
    'roomId',
    'placement',
    'tokenHash',
    'createdAt',
    'lastSeenAt',
    'updatedAt',
  ],
  properties: {
    authorizationId: {
      type: 'string',
      minLength: 1,
    },
    role: {
      type: 'string',
      enum: ['tv', 'terminal', 'room-panel'],
    },
    deviceId: {
      type: ['string', 'null'],
    },
    roomId: {
      type: ['string', 'null'],
    },
    placement: {
      type: ['string', 'null'],
      enum: ['outside', 'inside', null],
    },
    tokenHash: {
      type: 'string',
      pattern: '^[a-f0-9]{64}$',
    },
    createdAt: {
      type: 'string',
      format: 'date-time',
    },
    lastSeenAt: {
      type: ['string', 'null'],
      format: 'date-time',
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const DeviceAuthorizationImportRequest = {
  type: 'object',
  additionalProperties: false,
  required: ['authorizations'],
  properties: {
    authorizations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'authorizationId',
          'role',
          'deviceId',
          'roomId',
          'placement',
          'tokenHash',
          'createdAt',
          'lastSeenAt',
          'updatedAt',
        ],
        properties: {
          authorizationId: {
            type: 'string',
            minLength: 1,
          },
          role: {
            type: 'string',
            enum: ['tv', 'terminal', 'room-panel'],
          },
          deviceId: {
            type: ['string', 'null'],
          },
          roomId: {
            type: ['string', 'null'],
          },
          placement: {
            type: ['string', 'null'],
            enum: ['outside', 'inside', null],
          },
          tokenHash: {
            type: 'string',
            pattern: '^[a-f0-9]{64}$',
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
          },
          lastSeenAt: {
            type: ['string', 'null'],
            format: 'date-time',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
          },
        },
      },
    },
  },
} as const;

export const DeviceAuthorizationImportReport = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'imported'],
  properties: {
    ok: {
      type: 'boolean',
      const: true,
    },
    imported: {
      type: 'integer',
      minimum: 0,
    },
  },
} as const;

export const DeviceAuthorizationListItem = {
  type: 'object',
  additionalProperties: false,
  required: ['authorizationId', 'role', 'createdAt', 'lastSeenAt'],
  properties: {
    authorizationId: {
      type: 'string',
      minLength: 1,
    },
    role: {
      type: 'string',
      enum: ['tv', 'terminal', 'room-panel'],
    },
    deviceId: {
      type: ['string', 'null'],
      minLength: 1,
    },
    roomId: {
      type: ['string', 'null'],
      minLength: 1,
    },
    placement: {
      type: ['string', 'null'],
      enum: ['outside', 'inside', null],
    },
    createdAt: {
      type: 'string',
      format: 'date-time',
    },
    lastSeenAt: {
      type: ['string', 'null'],
      format: 'date-time',
    },
  },
} as const;

export const DeviceAuthorizationListResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['authorizations'],
  properties: {
    authorizations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['authorizationId', 'role', 'createdAt', 'lastSeenAt'],
        properties: {
          authorizationId: {
            type: 'string',
            minLength: 1,
          },
          role: {
            type: 'string',
            enum: ['tv', 'terminal', 'room-panel'],
          },
          deviceId: {
            type: ['string', 'null'],
            minLength: 1,
          },
          roomId: {
            type: ['string', 'null'],
            minLength: 1,
          },
          placement: {
            type: ['string', 'null'],
            enum: ['outside', 'inside', null],
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
          },
          lastSeenAt: {
            type: ['string', 'null'],
            format: 'date-time',
          },
        },
      },
    },
  },
} as const;

export const DeviceAuthorizationRevokeReport = {
  type: 'object',
  additionalProperties: false,
  required: ['ok'],
  properties: {
    ok: {
      type: 'boolean',
      const: true,
    },
  },
} as const;

export const SettingsSnapshotImportReport = {
  type: 'object',
  required: [
    'ok',
    'settingsFormatVersion',
    'exportedAt',
    'routingMode',
    'portalEnabled',
    'setupContactMode',
    'messagingProviderCount',
    'catalogIntegrityOk',
    'skipProviderCredentials',
    'providerCredentialsSkipped',
    'disabledProviderIds',
  ],
  additionalProperties: false,
  properties: {
    ok: {
      type: 'boolean',
      const: true,
    },
    settingsFormatVersion: {
      type: 'integer',
      const: 1,
    },
    exportedAt: {
      type: 'string',
      format: 'date-time',
    },
    routingMode: {
      type: 'string',
      enum: ['simple', 'complex'],
    },
    portalEnabled: {
      type: 'boolean',
    },
    setupContactMode: {
      type: 'string',
      enum: ['unset', 'sample', 'own'],
    },
    messagingProviderCount: {
      type: 'integer',
      minimum: 0,
    },
    catalogIntegrityOk: {
      type: 'boolean',
      const: true,
    },
    skipProviderCredentials: {
      type: 'boolean',
    },
    providerCredentialsSkipped: {
      type: 'boolean',
    },
    disabledProviderIds: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
  },
} as const;

export const SettingsSnapshotImportError = {
  type: 'object',
  required: ['ok', 'errors'],
  additionalProperties: false,
  properties: {
    ok: {
      type: 'boolean',
      const: false,
    },
    code: {
      type: 'string',
      enum: [
        'UNKNOWN_FORMAT_VERSION',
        'INVALID_SNAPSHOT',
        'OPS_SETTINGS_INVALID',
        'CATALOG_INTEGRITY_FAILED',
        'IMPORT_FAILED',
      ],
    },
    errors: {
      type: 'array',
      items: {
        type: 'string',
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
    stackVersion: {
      type: ['string', 'null'],
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
    'postWaitingCallTargetId',
    'returnWindowMinutes',
    'practiceOpenFrom',
    'practiceOpenTo',
    'topics',
    'journeySettings',
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
    postWaitingCallTargetId: {
      type: ['string', 'null'],
      minLength: 1,
      maxLength: 64,
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
          journeyTemplateId: {
            type: ['string', 'null'],
            minLength: 1,
            maxLength: 128,
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
    journeySettings: {
      type: 'object',
      required: ['templates'],
      additionalProperties: false,
      properties: {
        templates: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'name', 'active', 'steps'],
            additionalProperties: false,
            properties: {
              id: {
                type: 'string',
                minLength: 1,
                maxLength: 128,
                pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
              },
              name: {
                type: 'string',
                minLength: 1,
                maxLength: 128,
              },
              topicId: {
                type: ['string', 'null'],
                minLength: 1,
                maxLength: 64,
              },
              active: {
                type: 'boolean',
              },
              steps: {
                type: 'array',
                items: {
                  type: 'object',
                  required: [
                    'id',
                    'sortOrder',
                    'movementMode',
                    'publicDisplayMode',
                    'completedWhen',
                  ],
                  additionalProperties: false,
                  properties: {
                    id: {
                      type: 'string',
                      minLength: 1,
                      maxLength: 128,
                    },
                    sortOrder: {
                      type: 'integer',
                      minimum: 0,
                      maximum: 99,
                    },
                    targetLocationId: {
                      type: ['string', 'null'],
                      minLength: 1,
                      maxLength: 64,
                    },
                    queueId: {
                      type: ['string', 'null'],
                      minLength: 1,
                      maxLength: 64,
                    },
                    movementMode: {
                      type: 'string',
                      enum: ['call', 'self_go', 'pickup'],
                    },
                    publicDisplayMode: {
                      type: 'string',
                      enum: ['visible', 'hidden', 'call_only'],
                    },
                    completedWhen: {
                      type: 'string',
                      enum: ['arrive', 'start', 'done'],
                    },
                    instructionText: {
                      type: ['string', 'null'],
                      maxLength: 256,
                    },
                  },
                },
              },
            },
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
          panels: {
            type: 'object',
            required: ['outside', 'inside'],
            additionalProperties: false,
            properties: {
              outside: {
                type: 'object',
                required: [
                  'enabled',
                  'mode',
                  'showPatientNames',
                  'allowCalling',
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
                  mode: {
                    type: 'string',
                    enum: ['display_only', 'arrival', 'staff_full'],
                  },
                  showPatientNames: {
                    type: 'boolean',
                  },
                  allowCalling: {
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
              inside: {
                type: 'object',
                required: [
                  'enabled',
                  'mode',
                  'showPatientNames',
                  'allowCalling',
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
                  mode: {
                    type: 'string',
                    enum: ['display_only', 'arrival', 'staff_full'],
                  },
                  showPatientNames: {
                    type: 'boolean',
                  },
                  allowCalling: {
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
    expectedUpdatedAt: {
      type: 'string',
      format: 'date-time',
    },
    routingMode: {
      type: 'string',
      enum: ['simple', 'complex'],
    },
    postWaitingCallTargetId: {
      type: ['string', 'null'],
      minLength: 1,
      maxLength: 64,
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
          journeyTemplateId: {
            type: ['string', 'null'],
            minLength: 1,
            maxLength: 128,
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
          panels: {
            type: 'object',
            additionalProperties: false,
            properties: {
              outside: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  enabled: {
                    type: 'boolean',
                  },
                  mode: {
                    type: 'string',
                    enum: ['display_only', 'arrival', 'staff_full'],
                  },
                  showPatientNames: {
                    type: 'boolean',
                  },
                  allowCalling: {
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
              inside: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  enabled: {
                    type: 'boolean',
                  },
                  mode: {
                    type: 'string',
                    enum: ['display_only', 'arrival', 'staff_full'],
                  },
                  showPatientNames: {
                    type: 'boolean',
                  },
                  allowCalling: {
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
    journeySettings: {
      type: 'object',
      required: ['templates'],
      additionalProperties: false,
      properties: {
        templates: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'name', 'active', 'steps'],
            additionalProperties: false,
            properties: {
              id: {
                type: 'string',
                minLength: 1,
                maxLength: 128,
                pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
              },
              name: {
                type: 'string',
                minLength: 1,
                maxLength: 128,
              },
              topicId: {
                type: ['string', 'null'],
                minLength: 1,
                maxLength: 64,
              },
              active: {
                type: 'boolean',
              },
              steps: {
                type: 'array',
                items: {
                  type: 'object',
                  required: [
                    'id',
                    'sortOrder',
                    'movementMode',
                    'publicDisplayMode',
                    'completedWhen',
                  ],
                  additionalProperties: false,
                  properties: {
                    id: {
                      type: 'string',
                      minLength: 1,
                      maxLength: 128,
                    },
                    sortOrder: {
                      type: 'integer',
                      minimum: 0,
                      maximum: 99,
                    },
                    targetLocationId: {
                      type: ['string', 'null'],
                      minLength: 1,
                      maxLength: 64,
                    },
                    queueId: {
                      type: ['string', 'null'],
                      minLength: 1,
                      maxLength: 64,
                    },
                    movementMode: {
                      type: 'string',
                      enum: ['call', 'self_go', 'pickup'],
                    },
                    publicDisplayMode: {
                      type: 'string',
                      enum: ['visible', 'hidden', 'call_only'],
                    },
                    completedWhen: {
                      type: 'string',
                      enum: ['arrive', 'start', 'done'],
                    },
                    instructionText: {
                      type: ['string', 'null'],
                      maxLength: 256,
                    },
                  },
                },
              },
            },
          },
        },
      },
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
    'postWaitingCallTargetId',
    'returnWindowMinutes',
    'practiceOpenFrom',
    'practiceOpenTo',
    'topics',
    'journeySettings',
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
    postWaitingCallTargetId: {
      type: ['string', 'null'],
      minLength: 1,
      maxLength: 64,
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
          journeyTemplateId: {
            type: ['string', 'null'],
            minLength: 1,
            maxLength: 128,
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
    journeySettings: {
      type: 'object',
      required: ['templates'],
      additionalProperties: false,
      properties: {
        templates: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'name', 'active', 'steps'],
            additionalProperties: false,
            properties: {
              id: {
                type: 'string',
                minLength: 1,
                maxLength: 128,
                pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
              },
              name: {
                type: 'string',
                minLength: 1,
                maxLength: 128,
              },
              topicId: {
                type: ['string', 'null'],
                minLength: 1,
                maxLength: 64,
              },
              active: {
                type: 'boolean',
              },
              steps: {
                type: 'array',
                items: {
                  type: 'object',
                  required: [
                    'id',
                    'sortOrder',
                    'movementMode',
                    'publicDisplayMode',
                    'completedWhen',
                  ],
                  additionalProperties: false,
                  properties: {
                    id: {
                      type: 'string',
                      minLength: 1,
                      maxLength: 128,
                    },
                    sortOrder: {
                      type: 'integer',
                      minimum: 0,
                      maximum: 99,
                    },
                    targetLocationId: {
                      type: ['string', 'null'],
                      minLength: 1,
                      maxLength: 64,
                    },
                    queueId: {
                      type: ['string', 'null'],
                      minLength: 1,
                      maxLength: 64,
                    },
                    movementMode: {
                      type: 'string',
                      enum: ['call', 'self_go', 'pickup'],
                    },
                    publicDisplayMode: {
                      type: 'string',
                      enum: ['visible', 'hidden', 'call_only'],
                    },
                    completedWhen: {
                      type: 'string',
                      enum: ['arrive', 'start', 'done'],
                    },
                    instructionText: {
                      type: ['string', 'null'],
                      maxLength: 256,
                    },
                  },
                },
              },
            },
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
          panels: {
            type: 'object',
            required: ['outside', 'inside'],
            additionalProperties: false,
            properties: {
              outside: {
                type: 'object',
                required: [
                  'enabled',
                  'mode',
                  'showPatientNames',
                  'allowCalling',
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
                  mode: {
                    type: 'string',
                    enum: ['display_only', 'arrival', 'staff_full'],
                  },
                  showPatientNames: {
                    type: 'boolean',
                  },
                  allowCalling: {
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
              inside: {
                type: 'object',
                required: [
                  'enabled',
                  'mode',
                  'showPatientNames',
                  'allowCalling',
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
                  mode: {
                    type: 'string',
                    enum: ['display_only', 'arrival', 'staff_full'],
                  },
                  showPatientNames: {
                    type: 'boolean',
                  },
                  allowCalling: {
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
        'OPS_SETTINGS_STALE',
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
        'OPS_SETTINGS_STALE',
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

export const PATCH_api_v1_ops_settingsResponse409 = {
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
        'OPS_SETTINGS_STALE',
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
  required: ['routingMode', 'openVisitCount', 'features'],
  additionalProperties: false,
  properties: {
    routingMode: {
      type: 'string',
      enum: ['simple', 'complex'],
    },
    openVisitCount: {
      type: 'integer',
      minimum: 0,
    },
    features: {
      type: 'object',
      required: ['complexRouting', 'journeyDesigner', 'routingSimulator', 'complexRoutingLicensed'],
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
        complexRoutingLicensed: {
          type: 'boolean',
        },
      },
    },
  },
} as const;

export const GET_api_v1_ops_settings_snapshotResponse200 = {
  type: 'object',
  required: [
    'settingsFormatVersion',
    'exportedAt',
    'opsSettings',
    'authSettings',
    'messagingProviderConfigs',
  ],
  additionalProperties: false,
  properties: {
    settingsFormatVersion: {
      type: 'integer',
      const: 1,
    },
    exportedAt: {
      type: 'string',
      format: 'date-time',
    },
    opsSettings: {
      type: 'object',
      additionalProperties: true,
    },
    authSettings: {
      type: 'object',
      required: ['staffPinHashMfa', 'staffPinHashOps', 'roomPanelPinHash'],
      additionalProperties: false,
      properties: {
        staffPinHashMfa: {
          type: 'string',
        },
        staffPinHashOps: {
          type: 'string',
        },
        roomPanelPinHash: {
          type: 'string',
        },
      },
    },
    messagingProviderConfigs: {
      type: 'array',
      items: {
        type: 'object',
        required: ['providerId', 'channel', 'enabled', 'credentialsJson'],
        additionalProperties: false,
        properties: {
          providerId: {
            type: 'string',
          },
          channel: {
            type: 'string',
            enum: ['sms', 'messenger'],
          },
          enabled: {
            type: 'boolean',
          },
          credentialsJson: {
            type: 'string',
          },
        },
      },
    },
  },
} as const;

export const GET_api_v1_ops_settings_snapshotResponse401 = {
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
        'OPS_SETTINGS_STALE',
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

export const POST_api_v1_ops_settings_snapshot_validateRequestBody = {
  type: 'object',
  required: [
    'settingsFormatVersion',
    'exportedAt',
    'opsSettings',
    'authSettings',
    'messagingProviderConfigs',
  ],
  additionalProperties: false,
  properties: {
    settingsFormatVersion: {
      type: 'integer',
      const: 1,
    },
    exportedAt: {
      type: 'string',
      format: 'date-time',
    },
    opsSettings: {
      type: 'object',
      additionalProperties: true,
    },
    authSettings: {
      type: 'object',
      required: ['staffPinHashMfa', 'staffPinHashOps', 'roomPanelPinHash'],
      additionalProperties: false,
      properties: {
        staffPinHashMfa: {
          type: 'string',
        },
        staffPinHashOps: {
          type: 'string',
        },
        roomPanelPinHash: {
          type: 'string',
        },
      },
    },
    messagingProviderConfigs: {
      type: 'array',
      items: {
        type: 'object',
        required: ['providerId', 'channel', 'enabled', 'credentialsJson'],
        additionalProperties: false,
        properties: {
          providerId: {
            type: 'string',
          },
          channel: {
            type: 'string',
            enum: ['sms', 'messenger'],
          },
          enabled: {
            type: 'boolean',
          },
          credentialsJson: {
            type: 'string',
          },
        },
      },
    },
    env: {
      type: 'object',
      additionalProperties: {
        type: 'string',
      },
    },
  },
} as const;

export const POST_api_v1_ops_settings_snapshot_validateResponse200 = {
  type: 'object',
  required: ['ok', 'errors'],
  additionalProperties: false,
  properties: {
    ok: {
      type: 'boolean',
    },
    errors: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    code: {
      type: 'string',
      enum: [
        'UNKNOWN_FORMAT_VERSION',
        'INVALID_SNAPSHOT',
        'OPS_SETTINGS_INVALID',
        'CATALOG_INTEGRITY_FAILED',
        'IMPORT_FAILED',
      ],
    },
  },
} as const;

export const POST_api_v1_ops_settings_snapshot_validateResponse401 = {
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
        'OPS_SETTINGS_STALE',
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

export const POST_api_v1_ops_settings_snapshot_importRequestBody = {
  type: 'object',
  required: [
    'settingsFormatVersion',
    'exportedAt',
    'opsSettings',
    'authSettings',
    'messagingProviderConfigs',
  ],
  additionalProperties: false,
  properties: {
    settingsFormatVersion: {
      type: 'integer',
      const: 1,
    },
    exportedAt: {
      type: 'string',
      format: 'date-time',
    },
    opsSettings: {
      type: 'object',
      additionalProperties: true,
    },
    authSettings: {
      type: 'object',
      required: ['staffPinHashMfa', 'staffPinHashOps', 'roomPanelPinHash'],
      additionalProperties: false,
      properties: {
        staffPinHashMfa: {
          type: 'string',
        },
        staffPinHashOps: {
          type: 'string',
        },
        roomPanelPinHash: {
          type: 'string',
        },
      },
    },
    messagingProviderConfigs: {
      type: 'array',
      items: {
        type: 'object',
        required: ['providerId', 'channel', 'enabled', 'credentialsJson'],
        additionalProperties: false,
        properties: {
          providerId: {
            type: 'string',
          },
          channel: {
            type: 'string',
            enum: ['sms', 'messenger'],
          },
          enabled: {
            type: 'boolean',
          },
          credentialsJson: {
            type: 'string',
          },
        },
      },
    },
    env: {
      type: 'object',
      additionalProperties: {
        type: 'string',
      },
    },
  },
} as const;

export const POST_api_v1_ops_settings_snapshot_importResponse200 = {
  type: 'object',
  required: [
    'ok',
    'settingsFormatVersion',
    'exportedAt',
    'routingMode',
    'portalEnabled',
    'setupContactMode',
    'messagingProviderCount',
    'catalogIntegrityOk',
    'skipProviderCredentials',
    'providerCredentialsSkipped',
    'disabledProviderIds',
  ],
  additionalProperties: false,
  properties: {
    ok: {
      type: 'boolean',
      const: true,
    },
    settingsFormatVersion: {
      type: 'integer',
      const: 1,
    },
    exportedAt: {
      type: 'string',
      format: 'date-time',
    },
    routingMode: {
      type: 'string',
      enum: ['simple', 'complex'],
    },
    portalEnabled: {
      type: 'boolean',
    },
    setupContactMode: {
      type: 'string',
      enum: ['unset', 'sample', 'own'],
    },
    messagingProviderCount: {
      type: 'integer',
      minimum: 0,
    },
    catalogIntegrityOk: {
      type: 'boolean',
      const: true,
    },
    skipProviderCredentials: {
      type: 'boolean',
    },
    providerCredentialsSkipped: {
      type: 'boolean',
    },
    disabledProviderIds: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
  },
} as const;

export const POST_api_v1_ops_settings_snapshot_importResponse400 = {
  oneOf: [
    {
      type: 'object',
      required: ['ok', 'errors'],
      additionalProperties: false,
      properties: {
        ok: {
          type: 'boolean',
          const: false,
        },
        code: {
          type: 'string',
          enum: [
            'UNKNOWN_FORMAT_VERSION',
            'INVALID_SNAPSHOT',
            'OPS_SETTINGS_INVALID',
            'CATALOG_INTEGRITY_FAILED',
            'IMPORT_FAILED',
          ],
        },
        errors: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
      },
    },
    {
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
            'OPS_SETTINGS_STALE',
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
    },
  ],
} as const;

export const POST_api_v1_ops_settings_snapshot_importResponse401 = {
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
        'OPS_SETTINGS_STALE',
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

export const GET_api_v1_ops_maintenance_infoResponse200 = {
  type: 'object',
  required: [
    'protocolVersion',
    'stackVersion',
    'snapshotExportFormatVersion',
    'snapshotImportFormatVersions',
  ],
  additionalProperties: false,
  properties: {
    protocolVersion: {
      type: 'integer',
      const: 1,
    },
    stackVersion: {
      type: ['string', 'null'],
    },
    snapshotExportFormatVersion: {
      type: 'integer',
    },
    snapshotImportFormatVersions: {
      type: 'array',
      items: {
        type: 'integer',
      },
    },
  },
} as const;

export const GET_api_v1_ops_maintenance_infoResponse401 = {
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
        'OPS_SETTINGS_STALE',
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

export const GET_api_v1_ops_device_authorizationsResponse200 = {
  type: 'object',
  additionalProperties: false,
  required: ['authorizations'],
  properties: {
    authorizations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['authorizationId', 'role', 'createdAt', 'lastSeenAt'],
        properties: {
          authorizationId: {
            type: 'string',
            minLength: 1,
          },
          role: {
            type: 'string',
            enum: ['tv', 'terminal', 'room-panel'],
          },
          deviceId: {
            type: ['string', 'null'],
            minLength: 1,
          },
          roomId: {
            type: ['string', 'null'],
            minLength: 1,
          },
          placement: {
            type: ['string', 'null'],
            enum: ['outside', 'inside', null],
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
          },
          lastSeenAt: {
            type: ['string', 'null'],
            format: 'date-time',
          },
        },
      },
    },
  },
} as const;

export const POST_api_v1_ops_device_authorizations_authorizationId_revokeParams = {
  type: 'object',
  required: ['authorizationId'],
  additionalProperties: false,
  properties: {
    authorizationId: {
      type: 'string',
      minLength: 1,
    },
  },
} as const;

export const POST_api_v1_ops_device_authorizations_authorizationId_revokeResponse200 = {
  type: 'object',
  additionalProperties: false,
  required: ['ok'],
  properties: {
    ok: {
      type: 'boolean',
      const: true,
    },
  },
} as const;

export const POST_api_v1_ops_device_authorizations_authorizationId_revokeResponse404 = {
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
        'OPS_SETTINGS_STALE',
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

export const POST_api_v1_ops_device_authorizations_importRequestBody = {
  type: 'object',
  additionalProperties: false,
  required: ['authorizations'],
  properties: {
    authorizations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'authorizationId',
          'role',
          'deviceId',
          'roomId',
          'placement',
          'tokenHash',
          'createdAt',
          'lastSeenAt',
          'updatedAt',
        ],
        properties: {
          authorizationId: {
            type: 'string',
            minLength: 1,
          },
          role: {
            type: 'string',
            enum: ['tv', 'terminal', 'room-panel'],
          },
          deviceId: {
            type: ['string', 'null'],
          },
          roomId: {
            type: ['string', 'null'],
          },
          placement: {
            type: ['string', 'null'],
            enum: ['outside', 'inside', null],
          },
          tokenHash: {
            type: 'string',
            pattern: '^[a-f0-9]{64}$',
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
          },
          lastSeenAt: {
            type: ['string', 'null'],
            format: 'date-time',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
          },
        },
      },
    },
  },
} as const;

export const POST_api_v1_ops_device_authorizations_importResponse200 = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'imported'],
  properties: {
    ok: {
      type: 'boolean',
      const: true,
    },
    imported: {
      type: 'integer',
      minimum: 0,
    },
  },
} as const;

export const POST_api_v1_ops_device_authorizations_importResponse400 = {
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
        'OPS_SETTINGS_STALE',
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

export const POST_api_v1_ops_device_authorizations_importResponse401 = {
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
        'OPS_SETTINGS_STALE',
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
        'OPS_SETTINGS_STALE',
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
        'OPS_SETTINGS_STALE',
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
        'OPS_SETTINGS_STALE',
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
        'OPS_SETTINGS_STALE',
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
        'OPS_SETTINGS_STALE',
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
        'OPS_SETTINGS_STALE',
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
        'OPS_SETTINGS_STALE',
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
    'visitCount',
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
        'OPS_SETTINGS_STALE',
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

export const POST_api_v1_ops_maintenance_runtime_resetResponse409 = {
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
        'OPS_SETTINGS_STALE',
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

export const POST_api_v1_ops_maintenance_runtime_resetResponse503 = {
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
        'OPS_SETTINGS_STALE',
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
        'OPS_SETTINGS_STALE',
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

export const POST_api_v1_ops_day_lifecycle_resetResponse409 = {
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
        'OPS_SETTINGS_STALE',
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

export const POST_api_v1_ops_day_lifecycle_resetResponse503 = {
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
        'OPS_SETTINGS_STALE',
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
        'OPS_SETTINGS_STALE',
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
        'OPS_SETTINGS_STALE',
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
        'OPS_SETTINGS_STALE',
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
        'OPS_SETTINGS_STALE',
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
        'OPS_SETTINGS_STALE',
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
        'OPS_SETTINGS_STALE',
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
        'OPS_SETTINGS_STALE',
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
  RoomPanelPlacementConfig,
  RoomPanelsSettings,
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
  JourneyStepSetting,
  JourneyTemplateSetting,
  JourneySettings,
  OpsSettingsResponse,
  RoutingCapabilitiesResponse,
  SettingsSnapshotAuthSettingsV1,
  SettingsSnapshotMessagingProviderConfigV1,
  SettingsSnapshotOpsSettingsV1,
  SettingsSnapshotDbV1,
  SettingsSnapshotV1,
  MaintenanceApiInfo,
  SettingsSnapshotValidationResult,
  DeviceAuthorizationCopyRow,
  DeviceAuthorizationImportRequest,
  DeviceAuthorizationImportReport,
  DeviceAuthorizationListItem,
  DeviceAuthorizationListResponse,
  DeviceAuthorizationRevokeReport,
  SettingsSnapshotImportReport,
  SettingsSnapshotImportError,
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
  PATCH_api_v1_ops_settingsResponse409,
  GET_api_v1_ops_settings_capabilitiesResponse200,
  GET_api_v1_ops_settings_snapshotResponse200,
  GET_api_v1_ops_settings_snapshotResponse401,
  POST_api_v1_ops_settings_snapshot_validateRequestBody,
  POST_api_v1_ops_settings_snapshot_validateResponse200,
  POST_api_v1_ops_settings_snapshot_validateResponse401,
  POST_api_v1_ops_settings_snapshot_importRequestBody,
  POST_api_v1_ops_settings_snapshot_importResponse200,
  POST_api_v1_ops_settings_snapshot_importResponse400,
  POST_api_v1_ops_settings_snapshot_importResponse401,
  GET_api_v1_ops_maintenance_infoResponse200,
  GET_api_v1_ops_maintenance_infoResponse401,
  GET_api_v1_ops_device_authorizationsResponse200,
  POST_api_v1_ops_device_authorizations_authorizationId_revokeParams,
  POST_api_v1_ops_device_authorizations_authorizationId_revokeResponse200,
  POST_api_v1_ops_device_authorizations_authorizationId_revokeResponse404,
  POST_api_v1_ops_device_authorizations_importRequestBody,
  POST_api_v1_ops_device_authorizations_importResponse200,
  POST_api_v1_ops_device_authorizations_importResponse400,
  POST_api_v1_ops_device_authorizations_importResponse401,
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
  POST_api_v1_ops_maintenance_runtime_resetResponse409,
  POST_api_v1_ops_maintenance_runtime_resetResponse503,
  GET_api_v1_ops_outbox_statusResponse200,
  GET_api_v1_ops_day_lifecycleResponse200,
  POST_api_v1_ops_day_lifecycle_resetRequestBody,
  POST_api_v1_ops_day_lifecycle_resetResponse200,
  POST_api_v1_ops_day_lifecycle_resetResponse400,
  POST_api_v1_ops_day_lifecycle_resetResponse409,
  POST_api_v1_ops_day_lifecycle_resetResponse503,
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
