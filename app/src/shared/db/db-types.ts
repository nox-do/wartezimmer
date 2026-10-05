import type { TerminalPatientLocale } from '@praxis-flow/domain';
import type { JourneySettings } from '../journey-settings.js';

export const TICKET_STATUSES = [
  'waiting',
  'directed',
  'called',
  'in_room',
  'done',
  'absent_wait_here',
  'absent_return_later',
  'cancelled',
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export function isTicketStatus(value: string): value is TicketStatus {
  return (TICKET_STATUSES as readonly string[]).includes(value);
}

/** Fields supplied by check-in routes / callers; lane and topic label are resolved from ops settings. */
export type CreateTicketCallerInput = {
  topicId: string;
  authPath: string;
  identityRef?: string;
  checkinPhone?: string | null;
  checkinLocale?: TerminalPatientLocale | null;
  needsAssistance?: boolean;
};

export type CreateTicketInput = CreateTicketCallerInput & {
  laneCode: string;
  topicLabel: string;
  destinationRoomId: string;
  destinationRoomLabel: string;
};

export type VisitPortalContext = {
  authPath: string;
};

export type PatientSessionMe = PatientSession & VisitPortalContext;

export type QueueVisitRow = {
  id: string;
  laneCode: string;
  number: number;
  topicId: string;
  topicLabel: string;
  destinationRoomId: string;
  destinationRoomLabel: string;
  status: TicketStatus;
  createdAt: string;
  calledAt: string | null;
  identityRef: string | null;
  identityRefEditable?: boolean;
  checkinPhone: string | null;
  roomId: string | null;
  roomLabel: string | null;
  journeyStepCompletedAt: string | null;
  startedAt: string | null;
  movementMode: 'call' | 'self_go' | 'pickup' | null;
  callbackPhone: string | null;
  recallNotifyErrorCode: string | null;
  recallNotifySent: boolean;
  returnUntil: string | null;
  triageLevel: string | null;
  documentCount: number;
  needsAssistance: boolean;
  terminalAssistancePending: boolean;
  escortTransferPending: boolean;
};

export type QueueDisplayStatus = TicketStatus;

export type VisitIdentityView = {
  visitId: string;
  laneCode: string;
  number: number;
  topicId: string;
  topicLabel: string;
  authPath: string;
  identityRef: string | null;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
};

export type QueueSummary = {
  waitingNow: number;
  calledNow: number;
  inRoomNow: number;
  absentNow: number;
  processedToday: number;
};

export type AbsenceMode = 'wait_here' | 'return_later';
export type DayClosePhase = 'open' | 'started';

export const SESSION_STATUSES = ['active', 'expired', 'revoked'] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];

export function isSessionStatus(value: string): value is SessionStatus {
  return (SESSION_STATUSES as readonly string[]).includes(value);
}

export type PatientSession = {
  sessionId: string;
  visitId: string;
  expiresAt: string;
  createdAt: string;
  status: SessionStatus;
};

export type SessionResolveResult = {
  sessionId: string;
  sessionToken: string;
  expiresAt: string;
  visitId: string;
};

export type DocumentSource = 'upload' | 'form';
export type DocumentStatus =
  | 'received'
  | 'scanning'
  | 'scan_clean'
  | 'blocked_malware'
  | 'scan_error'
  | 'preview_requested'
  | 'discarded_by_patient'
  | 'discarded_by_mfa'
  | 'export_requested'
  | 'exported';

export type PatientDocumentRow = {
  id: string;
  visitId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  createdAt: string;
  updatedAt: string;
};

export type MfaDocumentRow = PatientDocumentRow & {
  source: DocumentSource;
  sessionId: string;
};

export type RoutingMode = 'simple' | 'complex';

export type OpsSettings = {
  routingMode: RoutingMode;
  postWaitingCallTargetId: string | null;
  returnWindowMinutes: number;
  longWaitThresholdMinutes: number;
  practiceOpenFrom: string;
  practiceOpenTo: string;
  practiceProfileJson: string;
  topics: Array<{
    topicId: string;
    label: string;
    laneCode: string;
    defaultRoomId: string;
    iconId: string | null;
    accentColor: string;
    enabled: boolean;
    availableFrom: string | null;
    availableTo: string | null;
    sortOrder: number;
    /** Complex routing only — sync sets routingRule.journeyTemplateId when set. */
    journeyTemplateId?: string | null;
  }>;
  journeySettings: JourneySettings;
  rooms: Array<{
    roomId: string;
    roomLabel: string;
    enabled: boolean;
    defaultCallTarget: boolean;
    maxOccupancy: number | null;
    panels: RoomPanelsSettings;
  }>;
  contactLookupFolderPath: string | null;
  contactLookupDelimiterMode: 'auto' | 'semicolon' | 'comma' | 'tab';
  contactLookupHasHeader: boolean;
  contactLookupMappingJson: string;
  emergencyEnabled: boolean;
  terminalWlanPromoEnabled: boolean;
  terminalAuthPhoneEnabled: boolean;
  terminalAuthNameDobEnabled: boolean;
  terminalAuthEgkEnabled: boolean;
  terminalPatientLocales: TerminalPatientLocale[];
  smsProvider: string;
  exportBasePath: string;
  updatedAt: string;
};

export type RoomPanelPlacement = import('@praxis-flow/domain').RoomPanelPlacement;

export type RoomPanelMode = import('@praxis-flow/domain').RoomPanelMode;

export type RoomPanelTextPreset = import('@praxis-flow/domain').RoomPanelTextPreset;

export type RoomPanelPlacementConfig = import('@praxis-flow/domain').RoomPanelPlacementConfig;

export type RoomPanelsSettings = import('@praxis-flow/domain').RoomPanelsSettings;

export type OutboxEventRow = {
  id: string;
  eventType: string;
  aggregateId: string;
  payloadJson: string;
  createdAt: string;
  attemptCount: number;
};

export type OutboxStatus = {
  readyCount: number;
  retryScheduledCount: number;
  deadLetterCount: number;
  oldestPendingCreatedAt: string | null;
};

export type DocumentExportInfo = {
  documentId: string;
  visitId: string;
  ticketLaneCode: string;
  ticketNumber: number;
  identityRef: string | null;
  source: DocumentSource;
  fileName: string;
  mimeType: string;
  status: DocumentStatus;
};

export type DayLifecycleState = {
  businessDay: string;
  lastResetBusinessDay: string;
  needsDayStartHint: boolean;
  checkinLocked: boolean;
  dayClosePhase: DayClosePhase;
  lastDayStats: BusinessDayVisitStats | null;
};

export type BusinessDayTopicCount = {
  topicId: string;
  topicLabel: string;
  count: number;
};

export type BusinessDayOpenVisit = {
  visitId: string;
  laneCode: string;
  number: number;
  topicLabel: string;
  identityRef: string | null;
  status: TicketStatus;
};

export type BusinessDayVisitStats = {
  businessDay: string;
  totalVisits: number;
  maxWaitMs: number;
  byTopic: BusinessDayTopicCount[];
  openVisits: BusinessDayOpenVisit[];
};

export type EmergencyState = {
  active: boolean;
  emergencyId: string | null;
  raisedAt: string | null;
  acknowledgedAt: string | null;
};

export type EmergencyRaiseResult = {
  emergencyId: string;
  status: 'raised';
  raisedAt: string;
  alreadyActive: boolean;
};

export type EmergencyAcknowledgeResult = {
  emergencyId: string;
  status: 'acknowledged';
  raisedAt: string;
  acknowledgedAt: string;
  uiDisplayed: true;
};

export type MessagingProviderCatalog = {
  channels: Array<{
    id: 'sms' | 'messenger';
    providers: Array<{
      id: string;
      label: string;
      channel: 'sms' | 'messenger';
      configured: boolean;
      enabled: boolean;
      requires: string[];
    }>;
  }>;
};
