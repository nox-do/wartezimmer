/**
 * AUTO-GENERATED from openapi/queue.yaml — do not edit.
 * Run: npm run generate:api-schemas
 */

export const QueueItem = {
  type: 'object',
  additionalProperties: false,
  required: [
    'visitId',
    'laneCode',
    'number',
    'topicId',
    'status',
    'arrivedAt',
    'waitMs',
    'documentCount',
    'hasMobilePhone',
    'needsAssistance',
    'terminalAssistancePending',
    'escortTransferPending',
  ],
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
    topicId: {
      type: 'string',
    },
    topicLabel: {
      type: 'string',
    },
    destinationRoomId: {
      type: ['string', 'null'],
    },
    destinationRoomLabel: {
      type: ['string', 'null'],
    },
    status: {
      type: 'string',
      enum: [
        'waiting',
        'directed',
        'called',
        'in_room',
        'done',
        'absent_wait_here',
        'absent_return_later',
        'cancelled',
      ],
    },
    roomId: {
      type: ['string', 'null'],
    },
    roomLabel: {
      type: ['string', 'null'],
    },
    journeyStepCompletedAt: {
      type: ['string', 'null'],
      format: 'date-time',
    },
    startedAt: {
      type: ['string', 'null'],
      format: 'date-time',
    },
    arrivedAt: {
      type: 'string',
      format: 'date-time',
    },
    waitMs: {
      type: 'integer',
    },
    documentCount: {
      type: 'integer',
    },
    hasMobilePhone: {
      type: 'boolean',
    },
    checkinPhone: {
      type: ['string', 'null'],
    },
    callbackPhone: {
      type: ['string', 'null'],
    },
    identityRef: {
      type: ['string', 'null'],
    },
    identityRefEditable: {
      type: 'boolean',
    },
    returnUntil: {
      type: ['string', 'null'],
      format: 'date-time',
    },
    recallNotifyErrorCode: {
      type: ['string', 'null'],
    },
    recallNotifySent: {
      type: 'boolean',
    },
    triageLevel: {
      type: ['string', 'null'],
      enum: ['red', 'yellow', 'green', null],
    },
    needsAssistance: {
      type: 'boolean',
    },
    terminalAssistancePending: {
      type: 'boolean',
    },
    escortTransferPending: {
      type: 'boolean',
    },
    movementMode: {
      type: ['string', 'null'],
      enum: ['call', 'self_go', 'pickup', null],
    },
  },
} as const;

export const QueueTriageResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['resultType', 'visitId', 'triageLevel', 'updatedAt'],
  properties: {
    resultType: {
      type: 'string',
      const: 'triage',
    },
    visitId: {
      type: 'string',
    },
    triageLevel: {
      type: ['string', 'null'],
      enum: ['red', 'yellow', 'green', null],
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const QueueMessageDispatch = {
  type: 'object',
  additionalProperties: false,
  required: ['provider', 'attempted', 'sent'],
  properties: {
    provider: {
      type: 'string',
    },
    attempted: {
      type: 'boolean',
    },
    sent: {
      type: 'boolean',
    },
    messageId: {
      type: 'string',
    },
    errorCode: {
      type: 'string',
    },
    fallbackFrom: {
      type: 'string',
    },
  },
} as const;

export const QueueRecallRetryNotifyResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['resultType', 'visitId', 'returnUntil', 'recallNotifyErrorCode', 'smsDispatch'],
  properties: {
    resultType: {
      type: 'string',
      const: 'recall_notify_retry',
    },
    visitId: {
      type: 'string',
    },
    returnUntil: {
      type: 'string',
      format: 'date-time',
    },
    recallNotifyErrorCode: {
      type: ['string', 'null'],
    },
    smsDispatch: {
      type: 'object',
      additionalProperties: false,
      required: ['provider', 'attempted', 'sent'],
      properties: {
        provider: {
          type: 'string',
        },
        attempted: {
          type: 'boolean',
        },
        sent: {
          type: 'boolean',
        },
        messageId: {
          type: 'string',
        },
        errorCode: {
          type: 'string',
        },
        fallbackFrom: {
          type: 'string',
        },
      },
    },
  },
} as const;

export const QueueCallbackPhoneResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['visitId', 'callbackPhone', 'updatedAt'],
  properties: {
    visitId: {
      type: 'string',
    },
    callbackPhone: {
      type: 'string',
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const QueueCallbackPhoneClearResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['visitId', 'updatedAt'],
  properties: {
    visitId: {
      type: 'string',
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const QueueIdentityRefResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['visitId', 'identityRef', 'updatedAt'],
  properties: {
    visitId: {
      type: 'string',
    },
    identityRef: {
      type: 'string',
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const QueueSupersedeResponse = {
  type: 'object',
  additionalProperties: false,
  required: [
    'resultType',
    'supersededVisitId',
    'visitId',
    'laneCode',
    'number',
    'topicId',
    'topicLabel',
    'checkedInAt',
    'documentsRebound',
  ],
  properties: {
    resultType: {
      type: 'string',
      const: 'supersede',
    },
    supersededVisitId: {
      type: 'string',
    },
    visitId: {
      type: 'string',
    },
    laneCode: {
      type: 'string',
    },
    number: {
      type: 'integer',
      minimum: 1,
    },
    topicId: {
      type: 'string',
    },
    topicLabel: {
      type: 'string',
    },
    destinationRoomLabel: {
      type: ['string', 'null'],
    },
    checkedInAt: {
      type: 'string',
      format: 'date-time',
    },
    documentsRebound: {
      type: 'integer',
      minimum: 0,
    },
  },
} as const;

export const QueueListMfaResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['view', 'revision', 'items', 'checkinLocked', 'serverTime'],
  properties: {
    view: {
      type: 'string',
      const: 'mfa',
    },
    revision: {
      type: 'integer',
      minimum: 0,
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'visitId',
          'laneCode',
          'number',
          'topicId',
          'status',
          'arrivedAt',
          'waitMs',
          'documentCount',
          'hasMobilePhone',
          'needsAssistance',
          'terminalAssistancePending',
          'escortTransferPending',
        ],
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
          topicId: {
            type: 'string',
          },
          topicLabel: {
            type: 'string',
          },
          destinationRoomId: {
            type: ['string', 'null'],
          },
          destinationRoomLabel: {
            type: ['string', 'null'],
          },
          status: {
            type: 'string',
            enum: [
              'waiting',
              'directed',
              'called',
              'in_room',
              'done',
              'absent_wait_here',
              'absent_return_later',
              'cancelled',
            ],
          },
          roomId: {
            type: ['string', 'null'],
          },
          roomLabel: {
            type: ['string', 'null'],
          },
          journeyStepCompletedAt: {
            type: ['string', 'null'],
            format: 'date-time',
          },
          startedAt: {
            type: ['string', 'null'],
            format: 'date-time',
          },
          arrivedAt: {
            type: 'string',
            format: 'date-time',
          },
          waitMs: {
            type: 'integer',
          },
          documentCount: {
            type: 'integer',
          },
          hasMobilePhone: {
            type: 'boolean',
          },
          checkinPhone: {
            type: ['string', 'null'],
          },
          callbackPhone: {
            type: ['string', 'null'],
          },
          identityRef: {
            type: ['string', 'null'],
          },
          identityRefEditable: {
            type: 'boolean',
          },
          returnUntil: {
            type: ['string', 'null'],
            format: 'date-time',
          },
          recallNotifyErrorCode: {
            type: ['string', 'null'],
          },
          recallNotifySent: {
            type: 'boolean',
          },
          triageLevel: {
            type: ['string', 'null'],
            enum: ['red', 'yellow', 'green', null],
          },
          needsAssistance: {
            type: 'boolean',
          },
          terminalAssistancePending: {
            type: 'boolean',
          },
          escortTransferPending: {
            type: 'boolean',
          },
          movementMode: {
            type: ['string', 'null'],
            enum: ['call', 'self_go', 'pickup', null],
          },
        },
      },
    },
    checkinLocked: {
      type: 'boolean',
    },
    serverTime: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const QueueTvItem = {
  type: 'object',
  additionalProperties: false,
  required: ['laneCode', 'number', 'status', 'roomLabel'],
  properties: {
    laneCode: {
      type: 'string',
    },
    number: {
      type: 'integer',
    },
    status: {
      type: 'string',
      enum: [
        'waiting',
        'directed',
        'called',
        'in_room',
        'done',
        'absent_wait_here',
        'absent_return_later',
        'cancelled',
      ],
    },
    roomLabel: {
      type: ['string', 'null'],
    },
    movementMode: {
      type: ['string', 'null'],
      enum: ['call', 'self_go', 'pickup', null],
    },
  },
} as const;

export const QueueListTvResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['view', 'revision', 'items', 'checkinLocked', 'serverTime'],
  properties: {
    view: {
      type: 'string',
      const: 'tv',
    },
    revision: {
      type: 'integer',
      minimum: 0,
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['laneCode', 'number', 'status', 'roomLabel'],
        properties: {
          laneCode: {
            type: 'string',
          },
          number: {
            type: 'integer',
          },
          status: {
            type: 'string',
            enum: [
              'waiting',
              'directed',
              'called',
              'in_room',
              'done',
              'absent_wait_here',
              'absent_return_later',
              'cancelled',
            ],
          },
          roomLabel: {
            type: ['string', 'null'],
          },
          movementMode: {
            type: ['string', 'null'],
            enum: ['call', 'self_go', 'pickup', null],
          },
        },
      },
    },
    checkinLocked: {
      type: 'boolean',
    },
    serverTime: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const RoomPanelItemActions = {
  type: 'object',
  additionalProperties: false,
  properties: {
    canCall: {
      type: 'boolean',
    },
    canArrive: {
      type: 'boolean',
    },
    canCheckOut: {
      type: 'boolean',
    },
  },
} as const;

export const RoomPanelCapabilities = {
  type: 'object',
  additionalProperties: false,
  required: [
    'requiresPin',
    'canCheckIn',
    'canCheckOut',
    'mayShowPatientNames',
    'canCall',
    'callAnnouncementReachable',
  ],
  properties: {
    requiresPin: {
      type: 'boolean',
    },
    canCheckIn: {
      type: 'boolean',
    },
    canCheckOut: {
      type: 'boolean',
    },
    mayShowPatientNames: {
      type: 'boolean',
    },
    canCall: {
      type: 'boolean',
    },
    callAnnouncementReachable: {
      type: 'boolean',
    },
  },
} as const;

export const RoomPanelItem = {
  type: 'object',
  additionalProperties: false,
  required: ['visitId', 'laneCode', 'number', 'status', 'roomId', 'roomLabel', 'actions'],
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
    status: {
      type: 'string',
      enum: ['called', 'in_room', 'directed'],
    },
    calledAt: {
      type: 'string',
      format: 'date-time',
    },
    roomId: {
      type: 'string',
    },
    roomLabel: {
      type: 'string',
    },
    identityRef: {
      type: ['string', 'null'],
    },
    actions: {
      type: 'object',
      additionalProperties: false,
      properties: {
        canCall: {
          type: 'boolean',
        },
        canArrive: {
          type: 'boolean',
        },
        canCheckOut: {
          type: 'boolean',
        },
      },
    },
  },
} as const;

export const RoomPanelCallCandidate = {
  type: 'object',
  additionalProperties: false,
  required: ['visitId', 'laneCode', 'number', 'status', 'roomId', 'roomLabel', 'actions'],
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
    status: {
      type: 'string',
      enum: ['waiting', 'directed'],
    },
    roomId: {
      type: 'string',
    },
    roomLabel: {
      type: 'string',
    },
    identityRef: {
      type: ['string', 'null'],
    },
    actions: {
      type: 'object',
      additionalProperties: false,
      properties: {
        canCall: {
          type: 'boolean',
        },
        canArrive: {
          type: 'boolean',
        },
        canCheckOut: {
          type: 'boolean',
        },
      },
    },
  },
} as const;

export const RoomPanelSnapshot = {
  type: 'object',
  additionalProperties: false,
  required: [
    'view',
    'roomId',
    'roomLabel',
    'revision',
    'serverTime',
    'capabilities',
    'panel',
    'items',
  ],
  properties: {
    view: {
      type: 'string',
      const: 'room-panel',
    },
    roomId: {
      type: 'string',
    },
    roomLabel: {
      type: 'string',
    },
    revision: {
      type: 'integer',
      minimum: 0,
    },
    serverTime: {
      type: 'string',
      format: 'date-time',
    },
    capabilities: {
      type: 'object',
      additionalProperties: false,
      required: [
        'requiresPin',
        'canCheckIn',
        'canCheckOut',
        'mayShowPatientNames',
        'canCall',
        'callAnnouncementReachable',
      ],
      properties: {
        requiresPin: {
          type: 'boolean',
        },
        canCheckIn: {
          type: 'boolean',
        },
        canCheckOut: {
          type: 'boolean',
        },
        mayShowPatientNames: {
          type: 'boolean',
        },
        canCall: {
          type: 'boolean',
        },
        callAnnouncementReachable: {
          type: 'boolean',
        },
      },
    },
    panel: {
      type: 'object',
      additionalProperties: false,
      required: [
        'placement',
        'mode',
        'showPatientNames',
        'calledTextPreset',
        'calledTextCustom',
        'arrivedTextPreset',
        'arrivedTextCustom',
      ],
      properties: {
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
          enum: ['you_are_right', 'please_wait_here', 'please_enter', 'go_to_reception', 'custom'],
        },
        calledTextCustom: {
          type: ['string', 'null'],
        },
        arrivedTextPreset: {
          type: 'string',
          enum: ['you_are_right', 'please_wait_here', 'please_enter', 'go_to_reception', 'custom'],
        },
        arrivedTextCustom: {
          type: ['string', 'null'],
        },
      },
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['visitId', 'laneCode', 'number', 'status', 'roomId', 'roomLabel', 'actions'],
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
          status: {
            type: 'string',
            enum: ['called', 'in_room', 'directed'],
          },
          calledAt: {
            type: 'string',
            format: 'date-time',
          },
          roomId: {
            type: 'string',
          },
          roomLabel: {
            type: 'string',
          },
          identityRef: {
            type: ['string', 'null'],
          },
          actions: {
            type: 'object',
            additionalProperties: false,
            properties: {
              canCall: {
                type: 'boolean',
              },
              canArrive: {
                type: 'boolean',
              },
              canCheckOut: {
                type: 'boolean',
              },
            },
          },
        },
      },
    },
    callCandidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['visitId', 'laneCode', 'number', 'status', 'roomId', 'roomLabel', 'actions'],
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
          status: {
            type: 'string',
            enum: ['waiting', 'directed'],
          },
          roomId: {
            type: 'string',
          },
          roomLabel: {
            type: 'string',
          },
          identityRef: {
            type: ['string', 'null'],
          },
          actions: {
            type: 'object',
            additionalProperties: false,
            properties: {
              canCall: {
                type: 'boolean',
              },
              canArrive: {
                type: 'boolean',
              },
              canCheckOut: {
                type: 'boolean',
              },
            },
          },
        },
      },
    },
  },
} as const;

export const QueueListResponse = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['view', 'revision', 'items', 'checkinLocked', 'serverTime'],
      properties: {
        view: {
          type: 'string',
          const: 'mfa',
        },
        revision: {
          type: 'integer',
          minimum: 0,
        },
        items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'visitId',
              'laneCode',
              'number',
              'topicId',
              'status',
              'arrivedAt',
              'waitMs',
              'documentCount',
              'hasMobilePhone',
              'needsAssistance',
              'terminalAssistancePending',
              'escortTransferPending',
            ],
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
              topicId: {
                type: 'string',
              },
              topicLabel: {
                type: 'string',
              },
              destinationRoomId: {
                type: ['string', 'null'],
              },
              destinationRoomLabel: {
                type: ['string', 'null'],
              },
              status: {
                type: 'string',
                enum: [
                  'waiting',
                  'directed',
                  'called',
                  'in_room',
                  'done',
                  'absent_wait_here',
                  'absent_return_later',
                  'cancelled',
                ],
              },
              roomId: {
                type: ['string', 'null'],
              },
              roomLabel: {
                type: ['string', 'null'],
              },
              journeyStepCompletedAt: {
                type: ['string', 'null'],
                format: 'date-time',
              },
              startedAt: {
                type: ['string', 'null'],
                format: 'date-time',
              },
              arrivedAt: {
                type: 'string',
                format: 'date-time',
              },
              waitMs: {
                type: 'integer',
              },
              documentCount: {
                type: 'integer',
              },
              hasMobilePhone: {
                type: 'boolean',
              },
              checkinPhone: {
                type: ['string', 'null'],
              },
              callbackPhone: {
                type: ['string', 'null'],
              },
              identityRef: {
                type: ['string', 'null'],
              },
              identityRefEditable: {
                type: 'boolean',
              },
              returnUntil: {
                type: ['string', 'null'],
                format: 'date-time',
              },
              recallNotifyErrorCode: {
                type: ['string', 'null'],
              },
              recallNotifySent: {
                type: 'boolean',
              },
              triageLevel: {
                type: ['string', 'null'],
                enum: ['red', 'yellow', 'green', null],
              },
              needsAssistance: {
                type: 'boolean',
              },
              terminalAssistancePending: {
                type: 'boolean',
              },
              escortTransferPending: {
                type: 'boolean',
              },
              movementMode: {
                type: ['string', 'null'],
                enum: ['call', 'self_go', 'pickup', null],
              },
            },
          },
        },
        checkinLocked: {
          type: 'boolean',
        },
        serverTime: {
          type: 'string',
          format: 'date-time',
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['view', 'revision', 'items', 'checkinLocked', 'serverTime'],
      properties: {
        view: {
          type: 'string',
          const: 'tv',
        },
        revision: {
          type: 'integer',
          minimum: 0,
        },
        items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['laneCode', 'number', 'status', 'roomLabel'],
            properties: {
              laneCode: {
                type: 'string',
              },
              number: {
                type: 'integer',
              },
              status: {
                type: 'string',
                enum: [
                  'waiting',
                  'directed',
                  'called',
                  'in_room',
                  'done',
                  'absent_wait_here',
                  'absent_return_later',
                  'cancelled',
                ],
              },
              roomLabel: {
                type: ['string', 'null'],
              },
              movementMode: {
                type: ['string', 'null'],
                enum: ['call', 'self_go', 'pickup', null],
              },
            },
          },
        },
        checkinLocked: {
          type: 'boolean',
        },
        serverTime: {
          type: 'string',
          format: 'date-time',
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: [
        'view',
        'roomId',
        'roomLabel',
        'revision',
        'serverTime',
        'capabilities',
        'panel',
        'items',
      ],
      properties: {
        view: {
          type: 'string',
          const: 'room-panel',
        },
        roomId: {
          type: 'string',
        },
        roomLabel: {
          type: 'string',
        },
        revision: {
          type: 'integer',
          minimum: 0,
        },
        serverTime: {
          type: 'string',
          format: 'date-time',
        },
        capabilities: {
          type: 'object',
          additionalProperties: false,
          required: [
            'requiresPin',
            'canCheckIn',
            'canCheckOut',
            'mayShowPatientNames',
            'canCall',
            'callAnnouncementReachable',
          ],
          properties: {
            requiresPin: {
              type: 'boolean',
            },
            canCheckIn: {
              type: 'boolean',
            },
            canCheckOut: {
              type: 'boolean',
            },
            mayShowPatientNames: {
              type: 'boolean',
            },
            canCall: {
              type: 'boolean',
            },
            callAnnouncementReachable: {
              type: 'boolean',
            },
          },
        },
        panel: {
          type: 'object',
          additionalProperties: false,
          required: [
            'placement',
            'mode',
            'showPatientNames',
            'calledTextPreset',
            'calledTextCustom',
            'arrivedTextPreset',
            'arrivedTextCustom',
          ],
          properties: {
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
            },
          },
        },
        items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['visitId', 'laneCode', 'number', 'status', 'roomId', 'roomLabel', 'actions'],
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
              status: {
                type: 'string',
                enum: ['called', 'in_room', 'directed'],
              },
              calledAt: {
                type: 'string',
                format: 'date-time',
              },
              roomId: {
                type: 'string',
              },
              roomLabel: {
                type: 'string',
              },
              identityRef: {
                type: ['string', 'null'],
              },
              actions: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  canCall: {
                    type: 'boolean',
                  },
                  canArrive: {
                    type: 'boolean',
                  },
                  canCheckOut: {
                    type: 'boolean',
                  },
                },
              },
            },
          },
        },
        callCandidates: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['visitId', 'laneCode', 'number', 'status', 'roomId', 'roomLabel', 'actions'],
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
              status: {
                type: 'string',
                enum: ['waiting', 'directed'],
              },
              roomId: {
                type: 'string',
              },
              roomLabel: {
                type: 'string',
              },
              identityRef: {
                type: ['string', 'null'],
              },
              actions: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  canCall: {
                    type: 'boolean',
                  },
                  canArrive: {
                    type: 'boolean',
                  },
                  canCheckOut: {
                    type: 'boolean',
                  },
                },
              },
            },
          },
        },
      },
    },
  ],
} as const;

export const QueueSummaryResponse = {
  type: 'object',
  required: [
    'waitingNow',
    'calledNow',
    'inRoomNow',
    'absentNow',
    'processedToday',
    'checkinLocked',
    'dayClosePhase',
    'serverTime',
  ],
  properties: {
    waitingNow: {
      type: 'integer',
    },
    calledNow: {
      type: 'integer',
    },
    inRoomNow: {
      type: 'integer',
    },
    absentNow: {
      type: 'integer',
    },
    processedToday: {
      type: 'integer',
    },
    checkinLocked: {
      type: 'boolean',
    },
    dayClosePhase: {
      type: 'string',
      enum: ['open', 'started'],
    },
    serverTime: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const QueueCallResponse = {
  type: 'object',
  required: ['visitId', 'fromStatus', 'toStatus', 'updatedAt', 'roomId', 'roomLabel'],
  properties: {
    visitId: {
      type: 'string',
    },
    fromStatus: {
      type: 'string',
      enum: [
        'waiting',
        'directed',
        'called',
        'in_room',
        'done',
        'absent_wait_here',
        'absent_return_later',
        'cancelled',
      ],
    },
    toStatus: {
      type: 'string',
      enum: [
        'waiting',
        'directed',
        'called',
        'in_room',
        'done',
        'absent_wait_here',
        'absent_return_later',
        'cancelled',
      ],
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
    roomId: {
      type: ['string', 'null'],
    },
    roomLabel: {
      type: ['string', 'null'],
    },
  },
} as const;

export const QueueRoomActionBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    roomId: {
      type: 'string',
    },
    roomLabel: {
      type: 'string',
    },
    actingRoomId: {
      type: 'string',
      minLength: 1,
      maxLength: 64,
    },
  },
} as const;

export const QueueVisitTransitionRequest = {
  type: 'object',
  additionalProperties: false,
  required: ['type'],
  properties: {
    type: {
      type: 'string',
      enum: [
        'call',
        'check_in_room',
        'start_treatment',
        'continue_journey',
        'reassign_room',
        'check_out_room',
        'cancel',
        'return_to_waiting',
        'cycle_triage',
        'set_absence',
        'recall',
        'retry_recall_notify',
      ],
    },
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
    actingRoomId: {
      type: 'string',
      minLength: 1,
      maxLength: 64,
    },
    mode: {
      type: 'string',
      enum: ['wait_here', 'return_later'],
    },
    returnWindowMinutes: {
      type: 'integer',
      minimum: 1,
      maximum: 240,
    },
    notifyChannel: {
      type: 'string',
      enum: ['sms', 'whatsapp'],
    },
  },
} as const;

export const QueueVisitTransitionResponse = {
  oneOf: [
    {
      type: 'object',
      required: [
        'resultType',
        'visitId',
        'fromStatus',
        'toStatus',
        'updatedAt',
        'roomId',
        'roomLabel',
      ],
      properties: {
        resultType: {
          type: 'string',
          const: 'transition',
        },
        visitId: {
          type: 'string',
        },
        fromStatus: {
          type: 'string',
          enum: [
            'waiting',
            'directed',
            'called',
            'in_room',
            'done',
            'absent_wait_here',
            'absent_return_later',
            'cancelled',
          ],
        },
        toStatus: {
          type: 'string',
          enum: [
            'waiting',
            'directed',
            'called',
            'in_room',
            'done',
            'absent_wait_here',
            'absent_return_later',
            'cancelled',
          ],
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
        roomId: {
          type: ['string', 'null'],
        },
        roomLabel: {
          type: ['string', 'null'],
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['resultType', 'visitId', 'triageLevel', 'updatedAt'],
      properties: {
        resultType: {
          type: 'string',
          const: 'triage',
        },
        visitId: {
          type: 'string',
        },
        triageLevel: {
          type: ['string', 'null'],
          enum: ['red', 'yellow', 'green', null],
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
      },
    },
    {
      type: 'object',
      required: [
        'resultType',
        'visitId',
        'fromStatus',
        'toStatus',
        'updatedAt',
        'returnUntil',
        'smsDispatch',
      ],
      properties: {
        resultType: {
          type: 'string',
          const: 'recall',
        },
        visitId: {
          type: 'string',
        },
        fromStatus: {
          type: 'string',
          enum: [
            'waiting',
            'directed',
            'called',
            'in_room',
            'done',
            'absent_wait_here',
            'absent_return_later',
            'cancelled',
          ],
        },
        toStatus: {
          type: 'string',
          enum: [
            'waiting',
            'directed',
            'called',
            'in_room',
            'done',
            'absent_wait_here',
            'absent_return_later',
            'cancelled',
          ],
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
        returnUntil: {
          type: 'string',
          format: 'date-time',
        },
        smsDispatch: {
          oneOf: [
            {
              type: 'null',
            },
            {
              type: 'object',
              additionalProperties: false,
              required: ['provider', 'attempted', 'sent'],
              properties: {
                provider: {
                  type: 'string',
                },
                attempted: {
                  type: 'boolean',
                },
                sent: {
                  type: 'boolean',
                },
                messageId: {
                  type: 'string',
                },
                errorCode: {
                  type: 'string',
                },
                fallbackFrom: {
                  type: 'string',
                },
              },
            },
          ],
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['resultType', 'visitId', 'returnUntil', 'recallNotifyErrorCode', 'smsDispatch'],
      properties: {
        resultType: {
          type: 'string',
          const: 'recall_notify_retry',
        },
        visitId: {
          type: 'string',
        },
        returnUntil: {
          type: 'string',
          format: 'date-time',
        },
        recallNotifyErrorCode: {
          type: ['string', 'null'],
        },
        smsDispatch: {
          type: 'object',
          additionalProperties: false,
          required: ['provider', 'attempted', 'sent'],
          properties: {
            provider: {
              type: 'string',
            },
            attempted: {
              type: 'boolean',
            },
            sent: {
              type: 'boolean',
            },
            messageId: {
              type: 'string',
            },
            errorCode: {
              type: 'string',
            },
            fallbackFrom: {
              type: 'string',
            },
          },
        },
      },
    },
  ],
} as const;

export const QueueTransitionResponse = {
  type: 'object',
  required: ['resultType', 'visitId', 'fromStatus', 'toStatus', 'updatedAt', 'roomId', 'roomLabel'],
  properties: {
    resultType: {
      type: 'string',
      const: 'transition',
    },
    visitId: {
      type: 'string',
    },
    fromStatus: {
      type: 'string',
      enum: [
        'waiting',
        'directed',
        'called',
        'in_room',
        'done',
        'absent_wait_here',
        'absent_return_later',
        'cancelled',
      ],
    },
    toStatus: {
      type: 'string',
      enum: [
        'waiting',
        'directed',
        'called',
        'in_room',
        'done',
        'absent_wait_here',
        'absent_return_later',
        'cancelled',
      ],
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
    roomId: {
      type: ['string', 'null'],
    },
    roomLabel: {
      type: ['string', 'null'],
    },
  },
} as const;

export const QueueRecallResponse = {
  type: 'object',
  required: [
    'resultType',
    'visitId',
    'fromStatus',
    'toStatus',
    'updatedAt',
    'returnUntil',
    'smsDispatch',
  ],
  properties: {
    resultType: {
      type: 'string',
      const: 'recall',
    },
    visitId: {
      type: 'string',
    },
    fromStatus: {
      type: 'string',
      enum: [
        'waiting',
        'directed',
        'called',
        'in_room',
        'done',
        'absent_wait_here',
        'absent_return_later',
        'cancelled',
      ],
    },
    toStatus: {
      type: 'string',
      enum: [
        'waiting',
        'directed',
        'called',
        'in_room',
        'done',
        'absent_wait_here',
        'absent_return_later',
        'cancelled',
      ],
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
    returnUntil: {
      type: 'string',
      format: 'date-time',
    },
    smsDispatch: {
      oneOf: [
        {
          type: 'null',
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['provider', 'attempted', 'sent'],
          properties: {
            provider: {
              type: 'string',
            },
            attempted: {
              type: 'boolean',
            },
            sent: {
              type: 'boolean',
            },
            messageId: {
              type: 'string',
            },
            errorCode: {
              type: 'string',
            },
            fallbackFrom: {
              type: 'string',
            },
          },
        },
      ],
    },
  },
} as const;

export const AbsenceMode = {
  type: 'string',
  enum: ['wait_here', 'return_later'],
} as const;

export const MarkAbsenceLookupRequest = {
  type: 'object',
  additionalProperties: false,
  properties: {
    phoneNumber: {
      type: 'string',
      minLength: 3,
      maxLength: 64,
    },
    ticketCode: {
      type: 'string',
      minLength: 3,
      maxLength: 16,
    },
    mode: {
      type: 'string',
      enum: ['wait_here', 'return_later'],
    },
  },
} as const;

export const GET_api_v1_queueResponse200 = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['view', 'revision', 'items', 'checkinLocked', 'serverTime'],
      properties: {
        view: {
          type: 'string',
          const: 'mfa',
        },
        revision: {
          type: 'integer',
          minimum: 0,
        },
        items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'visitId',
              'laneCode',
              'number',
              'topicId',
              'status',
              'arrivedAt',
              'waitMs',
              'documentCount',
              'hasMobilePhone',
              'needsAssistance',
              'terminalAssistancePending',
              'escortTransferPending',
            ],
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
              topicId: {
                type: 'string',
              },
              topicLabel: {
                type: 'string',
              },
              destinationRoomId: {
                type: ['string', 'null'],
              },
              destinationRoomLabel: {
                type: ['string', 'null'],
              },
              status: {
                type: 'string',
                enum: [
                  'waiting',
                  'directed',
                  'called',
                  'in_room',
                  'done',
                  'absent_wait_here',
                  'absent_return_later',
                  'cancelled',
                ],
              },
              roomId: {
                type: ['string', 'null'],
              },
              roomLabel: {
                type: ['string', 'null'],
              },
              journeyStepCompletedAt: {
                type: ['string', 'null'],
                format: 'date-time',
              },
              startedAt: {
                type: ['string', 'null'],
                format: 'date-time',
              },
              arrivedAt: {
                type: 'string',
                format: 'date-time',
              },
              waitMs: {
                type: 'integer',
              },
              documentCount: {
                type: 'integer',
              },
              hasMobilePhone: {
                type: 'boolean',
              },
              checkinPhone: {
                type: ['string', 'null'],
              },
              callbackPhone: {
                type: ['string', 'null'],
              },
              identityRef: {
                type: ['string', 'null'],
              },
              identityRefEditable: {
                type: 'boolean',
              },
              returnUntil: {
                type: ['string', 'null'],
                format: 'date-time',
              },
              recallNotifyErrorCode: {
                type: ['string', 'null'],
              },
              recallNotifySent: {
                type: 'boolean',
              },
              triageLevel: {
                type: ['string', 'null'],
                enum: ['red', 'yellow', 'green', null],
              },
              needsAssistance: {
                type: 'boolean',
              },
              terminalAssistancePending: {
                type: 'boolean',
              },
              escortTransferPending: {
                type: 'boolean',
              },
              movementMode: {
                type: ['string', 'null'],
                enum: ['call', 'self_go', 'pickup', null],
              },
            },
          },
        },
        checkinLocked: {
          type: 'boolean',
        },
        serverTime: {
          type: 'string',
          format: 'date-time',
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['view', 'revision', 'items', 'checkinLocked', 'serverTime'],
      properties: {
        view: {
          type: 'string',
          const: 'tv',
        },
        revision: {
          type: 'integer',
          minimum: 0,
        },
        items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['laneCode', 'number', 'status', 'roomLabel'],
            properties: {
              laneCode: {
                type: 'string',
              },
              number: {
                type: 'integer',
              },
              status: {
                type: 'string',
                enum: [
                  'waiting',
                  'directed',
                  'called',
                  'in_room',
                  'done',
                  'absent_wait_here',
                  'absent_return_later',
                  'cancelled',
                ],
              },
              roomLabel: {
                type: ['string', 'null'],
              },
              movementMode: {
                type: ['string', 'null'],
                enum: ['call', 'self_go', 'pickup', null],
              },
            },
          },
        },
        checkinLocked: {
          type: 'boolean',
        },
        serverTime: {
          type: 'string',
          format: 'date-time',
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: [
        'view',
        'roomId',
        'roomLabel',
        'revision',
        'serverTime',
        'capabilities',
        'panel',
        'items',
      ],
      properties: {
        view: {
          type: 'string',
          const: 'room-panel',
        },
        roomId: {
          type: 'string',
        },
        roomLabel: {
          type: 'string',
        },
        revision: {
          type: 'integer',
          minimum: 0,
        },
        serverTime: {
          type: 'string',
          format: 'date-time',
        },
        capabilities: {
          type: 'object',
          additionalProperties: false,
          required: [
            'requiresPin',
            'canCheckIn',
            'canCheckOut',
            'mayShowPatientNames',
            'canCall',
            'callAnnouncementReachable',
          ],
          properties: {
            requiresPin: {
              type: 'boolean',
            },
            canCheckIn: {
              type: 'boolean',
            },
            canCheckOut: {
              type: 'boolean',
            },
            mayShowPatientNames: {
              type: 'boolean',
            },
            canCall: {
              type: 'boolean',
            },
            callAnnouncementReachable: {
              type: 'boolean',
            },
          },
        },
        panel: {
          type: 'object',
          additionalProperties: false,
          required: [
            'placement',
            'mode',
            'showPatientNames',
            'calledTextPreset',
            'calledTextCustom',
            'arrivedTextPreset',
            'arrivedTextCustom',
          ],
          properties: {
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
            },
          },
        },
        items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['visitId', 'laneCode', 'number', 'status', 'roomId', 'roomLabel', 'actions'],
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
              status: {
                type: 'string',
                enum: ['called', 'in_room', 'directed'],
              },
              calledAt: {
                type: 'string',
                format: 'date-time',
              },
              roomId: {
                type: 'string',
              },
              roomLabel: {
                type: 'string',
              },
              identityRef: {
                type: ['string', 'null'],
              },
              actions: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  canCall: {
                    type: 'boolean',
                  },
                  canArrive: {
                    type: 'boolean',
                  },
                  canCheckOut: {
                    type: 'boolean',
                  },
                },
              },
            },
          },
        },
        callCandidates: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['visitId', 'laneCode', 'number', 'status', 'roomId', 'roomLabel', 'actions'],
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
              status: {
                type: 'string',
                enum: ['waiting', 'directed'],
              },
              roomId: {
                type: 'string',
              },
              roomLabel: {
                type: 'string',
              },
              identityRef: {
                type: ['string', 'null'],
              },
              actions: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  canCall: {
                    type: 'boolean',
                  },
                  canArrive: {
                    type: 'boolean',
                  },
                  canCheckOut: {
                    type: 'boolean',
                  },
                },
              },
            },
          },
        },
      },
    },
  ],
} as const;

export const GET_api_v1_queue_summaryResponse200 = {
  type: 'object',
  required: [
    'waitingNow',
    'calledNow',
    'inRoomNow',
    'absentNow',
    'processedToday',
    'checkinLocked',
    'dayClosePhase',
    'serverTime',
  ],
  properties: {
    waitingNow: {
      type: 'integer',
    },
    calledNow: {
      type: 'integer',
    },
    inRoomNow: {
      type: 'integer',
    },
    absentNow: {
      type: 'integer',
    },
    processedToday: {
      type: 'integer',
    },
    checkinLocked: {
      type: 'boolean',
    },
    dayClosePhase: {
      type: 'string',
      enum: ['open', 'started'],
    },
    serverTime: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const POST_api_v1_queue_mark_absenceRequestBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    phoneNumber: {
      type: 'string',
      minLength: 3,
      maxLength: 64,
    },
    ticketCode: {
      type: 'string',
      minLength: 3,
      maxLength: 16,
    },
    mode: {
      type: 'string',
      enum: ['wait_here', 'return_later'],
    },
  },
} as const;

export const POST_api_v1_queue_mark_absenceResponse200 = {
  type: 'object',
  required: ['resultType', 'visitId', 'fromStatus', 'toStatus', 'updatedAt', 'roomId', 'roomLabel'],
  properties: {
    resultType: {
      type: 'string',
      const: 'transition',
    },
    visitId: {
      type: 'string',
    },
    fromStatus: {
      type: 'string',
      enum: [
        'waiting',
        'directed',
        'called',
        'in_room',
        'done',
        'absent_wait_here',
        'absent_return_later',
        'cancelled',
      ],
    },
    toStatus: {
      type: 'string',
      enum: [
        'waiting',
        'directed',
        'called',
        'in_room',
        'done',
        'absent_wait_here',
        'absent_return_later',
        'cancelled',
      ],
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
    roomId: {
      type: ['string', 'null'],
    },
    roomLabel: {
      type: ['string', 'null'],
    },
  },
} as const;

export const POST_api_v1_queue_mark_absenceResponse400 = {
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
        'REGISTRATION_LIMIT_REACHED',
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

export const POST_api_v1_queue_mark_absenceResponse404 = {
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
        'REGISTRATION_LIMIT_REACHED',
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

export const POST_api_v1_queue_mark_absenceResponse409 = {
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
        'REGISTRATION_LIMIT_REACHED',
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

export const POST_api_v1_queue_visitId_transitionParams = {
  type: 'object',
  required: ['visitId'],
  additionalProperties: false,
  properties: {
    visitId: {
      type: 'string',
      minLength: 1,
    },
  },
} as const;

export const POST_api_v1_queue_visitId_transitionRequestBody = {
  type: 'object',
  additionalProperties: false,
  required: ['type'],
  properties: {
    type: {
      type: 'string',
      enum: [
        'call',
        'check_in_room',
        'start_treatment',
        'continue_journey',
        'reassign_room',
        'check_out_room',
        'cancel',
        'return_to_waiting',
        'cycle_triage',
        'set_absence',
        'recall',
        'retry_recall_notify',
      ],
    },
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
    actingRoomId: {
      type: 'string',
      minLength: 1,
      maxLength: 64,
    },
    mode: {
      type: 'string',
      enum: ['wait_here', 'return_later'],
    },
    returnWindowMinutes: {
      type: 'integer',
      minimum: 1,
      maximum: 240,
    },
    notifyChannel: {
      type: 'string',
      enum: ['sms', 'whatsapp'],
    },
  },
} as const;

export const POST_api_v1_queue_visitId_transitionResponse200 = {
  oneOf: [
    {
      type: 'object',
      required: [
        'resultType',
        'visitId',
        'fromStatus',
        'toStatus',
        'updatedAt',
        'roomId',
        'roomLabel',
      ],
      properties: {
        resultType: {
          type: 'string',
          const: 'transition',
        },
        visitId: {
          type: 'string',
        },
        fromStatus: {
          type: 'string',
          enum: [
            'waiting',
            'directed',
            'called',
            'in_room',
            'done',
            'absent_wait_here',
            'absent_return_later',
            'cancelled',
          ],
        },
        toStatus: {
          type: 'string',
          enum: [
            'waiting',
            'directed',
            'called',
            'in_room',
            'done',
            'absent_wait_here',
            'absent_return_later',
            'cancelled',
          ],
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
        roomId: {
          type: ['string', 'null'],
        },
        roomLabel: {
          type: ['string', 'null'],
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['resultType', 'visitId', 'triageLevel', 'updatedAt'],
      properties: {
        resultType: {
          type: 'string',
          const: 'triage',
        },
        visitId: {
          type: 'string',
        },
        triageLevel: {
          type: ['string', 'null'],
          enum: ['red', 'yellow', 'green', null],
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
      },
    },
    {
      type: 'object',
      required: [
        'resultType',
        'visitId',
        'fromStatus',
        'toStatus',
        'updatedAt',
        'returnUntil',
        'smsDispatch',
      ],
      properties: {
        resultType: {
          type: 'string',
          const: 'recall',
        },
        visitId: {
          type: 'string',
        },
        fromStatus: {
          type: 'string',
          enum: [
            'waiting',
            'directed',
            'called',
            'in_room',
            'done',
            'absent_wait_here',
            'absent_return_later',
            'cancelled',
          ],
        },
        toStatus: {
          type: 'string',
          enum: [
            'waiting',
            'directed',
            'called',
            'in_room',
            'done',
            'absent_wait_here',
            'absent_return_later',
            'cancelled',
          ],
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
        returnUntil: {
          type: 'string',
          format: 'date-time',
        },
        smsDispatch: {
          oneOf: [
            {
              type: 'null',
            },
            {
              type: 'object',
              additionalProperties: false,
              required: ['provider', 'attempted', 'sent'],
              properties: {
                provider: {
                  type: 'string',
                },
                attempted: {
                  type: 'boolean',
                },
                sent: {
                  type: 'boolean',
                },
                messageId: {
                  type: 'string',
                },
                errorCode: {
                  type: 'string',
                },
                fallbackFrom: {
                  type: 'string',
                },
              },
            },
          ],
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['resultType', 'visitId', 'returnUntil', 'recallNotifyErrorCode', 'smsDispatch'],
      properties: {
        resultType: {
          type: 'string',
          const: 'recall_notify_retry',
        },
        visitId: {
          type: 'string',
        },
        returnUntil: {
          type: 'string',
          format: 'date-time',
        },
        recallNotifyErrorCode: {
          type: ['string', 'null'],
        },
        smsDispatch: {
          type: 'object',
          additionalProperties: false,
          required: ['provider', 'attempted', 'sent'],
          properties: {
            provider: {
              type: 'string',
            },
            attempted: {
              type: 'boolean',
            },
            sent: {
              type: 'boolean',
            },
            messageId: {
              type: 'string',
            },
            errorCode: {
              type: 'string',
            },
            fallbackFrom: {
              type: 'string',
            },
          },
        },
      },
    },
  ],
} as const;

export const POST_api_v1_queue_visitId_transitionResponse400 = {
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
        'REGISTRATION_LIMIT_REACHED',
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

export const POST_api_v1_queue_visitId_transitionResponse403 = {
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
        'REGISTRATION_LIMIT_REACHED',
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

export const POST_api_v1_queue_visitId_transitionResponse404 = {
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
        'REGISTRATION_LIMIT_REACHED',
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

export const POST_api_v1_queue_visitId_transitionResponse409 = {
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
        'REGISTRATION_LIMIT_REACHED',
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

export const PUT_api_v1_queue_visitId_callback_phoneParams = {
  type: 'object',
  required: ['visitId'],
  additionalProperties: false,
  properties: {
    visitId: {
      type: 'string',
      minLength: 1,
    },
  },
} as const;

export const PUT_api_v1_queue_visitId_callback_phoneRequestBody = {
  type: 'object',
  additionalProperties: false,
  required: ['callbackPhone'],
  properties: {
    callbackPhone: {
      type: 'string',
      minLength: 3,
      maxLength: 32,
    },
  },
} as const;

export const PUT_api_v1_queue_visitId_callback_phoneResponse200 = {
  type: 'object',
  additionalProperties: false,
  required: ['visitId', 'callbackPhone', 'updatedAt'],
  properties: {
    visitId: {
      type: 'string',
    },
    callbackPhone: {
      type: 'string',
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const PUT_api_v1_queue_visitId_callback_phoneResponse400 = {
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
        'REGISTRATION_LIMIT_REACHED',
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

export const PUT_api_v1_queue_visitId_callback_phoneResponse404 = {
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
        'REGISTRATION_LIMIT_REACHED',
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

export const PUT_api_v1_queue_visitId_callback_phoneResponse409 = {
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
        'REGISTRATION_LIMIT_REACHED',
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

export const DELETE_api_v1_queue_visitId_callback_phoneParams = {
  type: 'object',
  required: ['visitId'],
  additionalProperties: false,
  properties: {
    visitId: {
      type: 'string',
      minLength: 1,
    },
  },
} as const;

export const DELETE_api_v1_queue_visitId_callback_phoneResponse200 = {
  type: 'object',
  additionalProperties: false,
  required: ['visitId', 'updatedAt'],
  properties: {
    visitId: {
      type: 'string',
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const DELETE_api_v1_queue_visitId_callback_phoneResponse404 = {
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
        'REGISTRATION_LIMIT_REACHED',
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

export const DELETE_api_v1_queue_visitId_callback_phoneResponse409 = {
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
        'REGISTRATION_LIMIT_REACHED',
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

export const PATCH_api_v1_queue_visitId_identity_refParams = {
  type: 'object',
  required: ['visitId'],
  additionalProperties: false,
  properties: {
    visitId: {
      type: 'string',
      minLength: 1,
    },
  },
} as const;

export const PATCH_api_v1_queue_visitId_identity_refRequestBody = {
  type: 'object',
  additionalProperties: false,
  required: ['identityRef'],
  properties: {
    identityRef: {
      type: 'string',
      minLength: 1,
      maxLength: 160,
    },
  },
} as const;

export const PATCH_api_v1_queue_visitId_identity_refResponse200 = {
  type: 'object',
  additionalProperties: false,
  required: ['visitId', 'identityRef', 'updatedAt'],
  properties: {
    visitId: {
      type: 'string',
    },
    identityRef: {
      type: 'string',
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const PATCH_api_v1_queue_visitId_identity_refResponse400 = {
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
        'REGISTRATION_LIMIT_REACHED',
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

export const PATCH_api_v1_queue_visitId_identity_refResponse404 = {
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
        'REGISTRATION_LIMIT_REACHED',
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

export const PATCH_api_v1_queue_visitId_identity_refResponse409 = {
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
        'REGISTRATION_LIMIT_REACHED',
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

export const POST_api_v1_queue_visitId_supersedeParams = {
  type: 'object',
  required: ['visitId'],
  additionalProperties: false,
  properties: {
    visitId: {
      type: 'string',
      minLength: 1,
    },
  },
} as const;

export const POST_api_v1_queue_visitId_supersedeRequestBody = {
  type: 'object',
  additionalProperties: false,
  required: ['topicId'],
  properties: {
    topicId: {
      type: 'string',
      minLength: 1,
      maxLength: 64,
    },
  },
} as const;

export const POST_api_v1_queue_visitId_supersedeResponse200 = {
  type: 'object',
  additionalProperties: false,
  required: [
    'resultType',
    'supersededVisitId',
    'visitId',
    'laneCode',
    'number',
    'topicId',
    'topicLabel',
    'checkedInAt',
    'documentsRebound',
  ],
  properties: {
    resultType: {
      type: 'string',
      const: 'supersede',
    },
    supersededVisitId: {
      type: 'string',
    },
    visitId: {
      type: 'string',
    },
    laneCode: {
      type: 'string',
    },
    number: {
      type: 'integer',
      minimum: 1,
    },
    topicId: {
      type: 'string',
    },
    topicLabel: {
      type: 'string',
    },
    destinationRoomLabel: {
      type: ['string', 'null'],
    },
    checkedInAt: {
      type: 'string',
      format: 'date-time',
    },
    documentsRebound: {
      type: 'integer',
      minimum: 0,
    },
  },
} as const;

export const POST_api_v1_queue_visitId_supersedeResponse400 = {
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
        'REGISTRATION_LIMIT_REACHED',
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

export const POST_api_v1_queue_visitId_supersedeResponse403 = {
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
        'REGISTRATION_LIMIT_REACHED',
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

export const POST_api_v1_queue_visitId_supersedeResponse404 = {
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
        'REGISTRATION_LIMIT_REACHED',
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

export const POST_api_v1_queue_visitId_supersedeResponse409 = {
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
        'REGISTRATION_LIMIT_REACHED',
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

export const queueSchemas = {
  QueueItem,
  QueueTriageResponse,
  QueueMessageDispatch,
  QueueRecallRetryNotifyResponse,
  QueueCallbackPhoneResponse,
  QueueCallbackPhoneClearResponse,
  QueueIdentityRefResponse,
  QueueSupersedeResponse,
  QueueListMfaResponse,
  QueueTvItem,
  QueueListTvResponse,
  RoomPanelItemActions,
  RoomPanelCapabilities,
  RoomPanelItem,
  RoomPanelCallCandidate,
  RoomPanelSnapshot,
  QueueListResponse,
  QueueSummaryResponse,
  QueueCallResponse,
  QueueRoomActionBody,
  QueueVisitTransitionRequest,
  QueueVisitTransitionResponse,
  QueueTransitionResponse,
  QueueRecallResponse,
  AbsenceMode,
  MarkAbsenceLookupRequest,
  GET_api_v1_queueResponse200,
  GET_api_v1_queue_summaryResponse200,
  POST_api_v1_queue_mark_absenceRequestBody,
  POST_api_v1_queue_mark_absenceResponse200,
  POST_api_v1_queue_mark_absenceResponse400,
  POST_api_v1_queue_mark_absenceResponse404,
  POST_api_v1_queue_mark_absenceResponse409,
  POST_api_v1_queue_visitId_transitionParams,
  POST_api_v1_queue_visitId_transitionRequestBody,
  POST_api_v1_queue_visitId_transitionResponse200,
  POST_api_v1_queue_visitId_transitionResponse400,
  POST_api_v1_queue_visitId_transitionResponse403,
  POST_api_v1_queue_visitId_transitionResponse404,
  POST_api_v1_queue_visitId_transitionResponse409,
  PUT_api_v1_queue_visitId_callback_phoneParams,
  PUT_api_v1_queue_visitId_callback_phoneRequestBody,
  PUT_api_v1_queue_visitId_callback_phoneResponse200,
  PUT_api_v1_queue_visitId_callback_phoneResponse400,
  PUT_api_v1_queue_visitId_callback_phoneResponse404,
  PUT_api_v1_queue_visitId_callback_phoneResponse409,
  DELETE_api_v1_queue_visitId_callback_phoneParams,
  DELETE_api_v1_queue_visitId_callback_phoneResponse200,
  DELETE_api_v1_queue_visitId_callback_phoneResponse404,
  DELETE_api_v1_queue_visitId_callback_phoneResponse409,
  PATCH_api_v1_queue_visitId_identity_refParams,
  PATCH_api_v1_queue_visitId_identity_refRequestBody,
  PATCH_api_v1_queue_visitId_identity_refResponse200,
  PATCH_api_v1_queue_visitId_identity_refResponse400,
  PATCH_api_v1_queue_visitId_identity_refResponse404,
  PATCH_api_v1_queue_visitId_identity_refResponse409,
  POST_api_v1_queue_visitId_supersedeParams,
  POST_api_v1_queue_visitId_supersedeRequestBody,
  POST_api_v1_queue_visitId_supersedeResponse200,
  POST_api_v1_queue_visitId_supersedeResponse400,
  POST_api_v1_queue_visitId_supersedeResponse403,
  POST_api_v1_queue_visitId_supersedeResponse404,
  POST_api_v1_queue_visitId_supersedeResponse409,
} as const;
