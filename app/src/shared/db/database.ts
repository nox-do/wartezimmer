import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { createModuleLogger } from '@praxis-flow/server-shared/logger';
import {
  assertSupportedSchemaGeneration,
  createCurrentSchema,
  isUninitializedDatabase,
  readSchemaGeneration,
  runTransitionSchemaEnsures,
} from './create-current-schema.js';
import {
  applyDemoContactLookupSettings,
  ensureDemoContactLookupSeed,
} from '../contacts/ensure-demo-contact-csv.js';
import { ensurePracticeProfileSeedFromEnv } from '../practice/ensure-practice-profile-seed.js';
import {
  exportSettingsDbSnapshotFromDb,
  exportSettingsSnapshotFromDb,
} from '../settings/settings-snapshot-export.js';
import {
  importSettingsSnapshotIntoDb,
  type SettingsSnapshotImportResult,
} from '../settings/settings-snapshot-import.js';
import type {
  SettingsSnapshotImportOptions,
  SettingsSnapshotDbV1,
  SettingsSnapshotV1,
} from '../settings/settings-snapshot-types.js';
import { prepareCoreDatabaseStatements } from './database-statements.js';
import {
  getDayLifecycleStateFromDb,
  isEffectiveCheckinLockedFromDb,
  resetBusinessDayInDb,
  startDayCloseInDb,
} from './database-day-lifecycle.js';
import {
  executeRuntimeResetInDb,
  getRuntimeResetPreviewFromDb,
  type RuntimeResetPreview,
  type RuntimeResetResult,
} from './database-runtime-reset.js';
import { RUNTIME_RESET_CONFIRM_PHRASE } from '../ops/runtime-reset-constants.js';
import {
  resolveRoutingCapabilities,
  type RoutingCapabilities,
} from '../ops/routing-capabilities.js';
import { createVisitCheckInInDb } from '../flow-core/flow-core-checkin.js';
import {
  getFlowCoreRuntime,
  resetFlowCoreRuntimeForTests,
  syncFlowCoreCatalog,
} from '../flow-core/flow-core-runtime.js';
import { clearFlowCoreVisitRuntime } from '../flow-core/flow-core-schema.js';
import {
  arriveVisit,
  callVisit,
  cancelVisit,
  clearVisitCallbackPhone,
  completeVisit,
  continueJourneyVisit,
  cycleVisitTriageLevel,
  listVisitQueueRows,
  processExpiredRecallWindowForVisit,
  reassignVisitRoom,
  recallVisit,
  returnVisitToWaiting,
  returnAbsentVisitToQueue,
  setVisitAbsent,
  setVisitCallbackPhone,
  setVisitIdentityRef,
  startVisit,
  visitExistsInDb,
  requireVisitExistsInDb,
} from '../flow-core/visit-queue-bridge.js';
import { supersedeVisitTopic } from '../flow-core/visit-supersede-bridge.js';
import {
  clearAbsentMode,
  countVisitQueueSummary,
  listExpiredVisitRecallWindows,
  readVisitRecallNotifyRetryContext,
  setRecallNotifyError as setVisitRecallNotifyError,
  setRecallNotifySent as setVisitRecallNotifySent,
} from '../db/visit-host-state.js';
import {
  ensureSingleDefaultCallTarget,
  getOpsSettingsFromDb,
  updateOpsSettingsInDb,
  type OpsSettingsPatch,
} from './database-ops-settings.js';
import { validateRoomSettingsChange } from '../ops/room-removal-validation.js';
import {
  countOpenVisits,
  validateComplexRoutingLicenseChange,
  validateRoutingModeChange,
} from '../ops/routing-mode-guard.js';
import { validateJourneySettingsEditable } from '../ops/journey-template-guard.js';
import { OpsSettingsValidationError } from './ops-settings-errors.js';
import {
  createOpsSetupStatements,
  getOpsSetupFromDb,
  updateOpsSetupProgressInDb,
} from './database-ops-setup.js';
import { DomainError } from '../errors/domain-error.js';
import type { SetupContactMode, SetupWizardStep } from '../ops/setup-types.js';
import {
  completeSetupInDb,
  persistSetupProgress,
  readSetupStatusSnapshot,
  reopenSetupInDb,
} from '../ops/setup-service.js';
import type { SetupStatusSnapshot } from '../ops/setup-status.js';
import {
  cancelRecallWindowExpiry,
  clearAllRecallWindowExpiries,
  scheduleRecallWindowExpiry,
} from '../queue/recall-window-expiry-scheduler.js';
import { placeVisitInRoom as runPlaceVisitInRoom } from '../queue/place-visit-in-room.js';
import type { PlacementTransition } from '../queue/place-visit-in-room.js';
import {
  resolveMarkAbsenceTicket,
  type MarkAbsenceLookupDeps,
  type MarkAbsenceLookupInput,
} from '../queue/mark-absence-lookup.js';
import type { TriageLevel } from '../queue/queue-triage.js';
import {
  completeDocumentExportInDb,
  discardDocumentByMfaInDb,
  renameDocumentFileNameInDb,
  discardDocumentAfterMalwareInDb,
  assertPatientDocumentDiscardableInDb,
  discardPatientDocumentInDb,
  getDocumentByIdFromDb,
  getDocumentExportInfoFromDb,
  getDocumentForPreviewRequestFromDb,
  intakeFormDocumentsInDb,
  intakePatientDocumentInDb,
  type FormDocumentIntakeInput,
  listDocumentsForVisitFromDb,
  listPatientDocumentsInDb,
  requestDocumentExportInDb,
  requestDocumentPreviewInDb,
  rollbackDocumentExportRequestInDb,
  type DocumentDeps,
} from './database-documents.js';
import {
  getPatientSessionMeFromDb,
  getOpsStateFromDb,
  getTicketCodeByVisitIdFromDb,
  getVisitIdentityViewFromDb,
  isCheckinLockedFromDb,
  requirePatientSessionFromDb,
  resolvePatientSessionInDb,
  setCheckinLockInDb,
  submitPatientSessionInDb,
  verifyTicketCodeInDb,
  type CheckinSessionDeps,
} from './database-checkin-sessions.js';
import {
  acknowledgeEmergencyInDb,
  getEmergencyStateFromDb,
  raiseEmergencyInDb,
  type EmergencyDeps,
} from './database-emergency.js';
import {
  getMessagingProviderCatalogFromDb,
  getMessagingProviderRuntimeConfigFromDb,
  updateMessagingProviderConfigInDb,
  type MessagingDeps,
} from './database-messaging.js';
import {
  claimPendingOutboxEventsInDb,
  emitOutboxEventFromDb,
  getOutboxStatusFromDb,
  markOutboxDeadLetterInDb,
  markOutboxPublishedInDb,
  markOutboxRetryInDb,
  type OutboxDeps,
} from './database-outbox.js';
import {
  getAuthSettingsFromDb,
  updateAuthPinHashInDb,
  type AuthPinTarget,
  type AuthSettings,
} from './database-auth-settings.js';
import {
  authenticateDeviceAuthorization as authenticateDeviceAuthorizationInDb,
  createDeviceAuthorizationDeps,
  createSlotDeviceAuthorization,
  enrollRoomPanelDeviceAuthorization,
  getDeviceAuthorizationById,
  importActiveDeviceAuthorizations,
  listActiveDeviceAuthorizations,
  replaceSlotDeviceAuthorization,
  revokeAllRoomPanelAuthorizations,
  revokeDeviceAuthorizationById,
  revokeDeviceAuthorizationsByDevice,
  revokeRoomPanelAuthorizationsByPlacement,
  revokeRoomPanelAuthorizationsByRoom,
  touchDeviceAuthorization,
  type DeviceAuthorizationCopyRow,
  type DeviceAuthorizationDeps,
  type DeviceAuthorizationRow,
  type DeviceSlotRole,
} from './database-device-authorizations.js';
import {
  buildDatabaseCommonHelpers,
  buildOpsSettingsReadParams,
  buildOpsSettingsWriteParams,
  type EmitOutboxEventFn,
} from './database-deps.js';
import { configuredExportBasePath } from './database-config.js';
import { normalizeDayClosePhase, nowIso } from './database-time.js';
import { resolveBusinessTimeZone } from '../practice-time-windows.js';
import type {
  AbsenceMode,
  CreateTicketCallerInput,
  DayLifecycleState,
  DayClosePhase,
  DocumentStatus,
  DocumentExportInfo,
  EmergencyAcknowledgeResult,
  EmergencyRaiseResult,
  EmergencyState,
  MfaDocumentRow,
  MessagingProviderCatalog,
  OpsSettings,
  OutboxEventRow,
  OutboxStatus,
  PatientDocumentRow,
  PatientSession,
  PatientSessionMe,
  QueueDisplayStatus,
  QueueSummary,
  QueueVisitRow,
  RoomPanelPlacement,
  SessionResolveResult,
  VisitIdentityView,
} from './db-types.js';

export type {
  AbsenceMode,
  CreateTicketCallerInput,
  CreateTicketInput,
  DayLifecycleState,
  DayClosePhase,
  DocumentStatus,
  DocumentExportInfo,
  EmergencyAcknowledgeResult,
  EmergencyRaiseResult,
  EmergencyState,
  MfaDocumentRow,
  MessagingProviderCatalog,
  OpsSettings,
  OutboxEventRow,
  OutboxStatus,
  PatientDocumentRow,
  PatientSession,
  PatientSessionMe,
  QueueSummary,
  QueueVisitRow,
  SessionResolveResult,
  SessionStatus,
  TicketStatus,
  VisitIdentityView,
} from './db-types.js';

const log = createModuleLogger('db.core');

export class CoreDatabase {
  private readonly boundEmitOutboxEvent: EmitOutboxEventFn;
  private readonly db: DatabaseSync;
  private readonly findTicketByCodeStmt: StatementSync;
  private readonly checkinLockStmt: StatementSync;
  private readonly dayCloseStateStmt: StatementSync;
  private readonly emergencyStateStmt: StatementSync;
  private readonly updateCheckinLockStmt: StatementSync;
  private readonly updateDayClosePhaseStmt: StatementSync;
  private readonly updateLastResetBusinessDayStmt: StatementSync;
  private readonly raiseEmergencyStmt: StatementSync;
  private readonly acknowledgeEmergencyStmt: StatementSync;
  private readonly getOpsSettingsStmt: StatementSync;
  private readonly updateOpsSettingsStmt: StatementSync;
  private readonly getAuthSettingsStmt: StatementSync;
  private readonly updateAuthPinHashStmt: StatementSync;
  private readonly getOpsSetupStmt: StatementSync;
  private readonly updateOpsSetupProgressStmt: StatementSync;
  private readonly completeOpsSetupStmt: StatementSync;
  private readonly reopenOpsSetupStmt: StatementSync;
  private readonly listMessagingProviderConfigsStmt: StatementSync;
  private readonly getMessagingProviderConfigByIdStmt: StatementSync;
  private readonly upsertMessagingProviderConfigStmt: StatementSync;
  private readonly deleteAllOutboxEventsStmt: StatementSync;
  private readonly countAllOutboxEventsStmt: StatementSync;
  private readonly clearEmergencyStateStmt: StatementSync;
  private readonly countAllVisitsStmt: StatementSync;
  private readonly countVisitsByBusinessDayStmt: StatementSync;
  private readonly maxWaitMsByBusinessDayStmt: StatementSync;
  private readonly topicCountsByBusinessDayStmt: StatementSync;
  private readonly listOpenVisitsByBusinessDayStmt: StatementSync;
  private readonly listAbsenceLookupTicketsStmt: StatementSync;
  private readonly getVisitIdentityViewStmt: StatementSync;
  private readonly getVisitPortalContextStmt: StatementSync;
  private readonly insertOutboxEventStmt: StatementSync;
  private readonly listPendingOutboxEventsStmt: StatementSync;
  private readonly claimOutboxEventStmt: StatementSync;
  private readonly markOutboxPublishedStmt: StatementSync;
  private readonly markOutboxRetryStmt: StatementSync;
  private readonly markOutboxDeadLetterStmt: StatementSync;
  private readonly getOutboxStatusStmt: StatementSync;
  private readonly insertPatientSessionStmt: StatementSync;
  private readonly expireActiveSessionsByVisitStmt: StatementSync;
  private readonly getActiveSessionByVisitStmt: StatementSync;
  private readonly getPatientSessionByTokenStmt: StatementSync;
  private readonly touchPatientSessionStmt: StatementSync;
  private readonly expirePatientSessionStmt: StatementSync;
  private readonly revokePatientSessionStmt: StatementSync;
  private readonly insertDocumentStmt: StatementSync;
  private readonly listPatientDocumentsStmt: StatementSync;
  private readonly getSessionDocumentStmt: StatementSync;
  private readonly getDocumentByIdStmt: StatementSync;
  private readonly getDocumentExportInfoStmt: StatementSync;
  private readonly updateDocumentStatusStmt: StatementSync;
  private readonly updateDocumentFileNameStmt: StatementSync;
  private readonly listDocumentsByVisitStmt: StatementSync;
  private readonly deviceAuthorizationDeps: DeviceAuthorizationDeps;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA busy_timeout = 5000;');

    if (isUninitializedDatabase(this.db)) {
      createCurrentSchema(this.db);
    } else {
      assertSupportedSchemaGeneration(this.db);
      if (readSchemaGeneration(this.db) === 0) {
        runTransitionSchemaEnsures(this.db);
      }
    }

    ensureDemoContactLookupSeed(this.db);
    ensurePracticeProfileSeedFromEnv(this.db);
    ({
      findTicketByCodeStmt: this.findTicketByCodeStmt,
      checkinLockStmt: this.checkinLockStmt,
      dayCloseStateStmt: this.dayCloseStateStmt,
      emergencyStateStmt: this.emergencyStateStmt,
      updateCheckinLockStmt: this.updateCheckinLockStmt,
      updateDayClosePhaseStmt: this.updateDayClosePhaseStmt,
      updateLastResetBusinessDayStmt: this.updateLastResetBusinessDayStmt,
      raiseEmergencyStmt: this.raiseEmergencyStmt,
      acknowledgeEmergencyStmt: this.acknowledgeEmergencyStmt,
      getOpsSettingsStmt: this.getOpsSettingsStmt,
      updateOpsSettingsStmt: this.updateOpsSettingsStmt,
      getAuthSettingsStmt: this.getAuthSettingsStmt,
      updateAuthPinHashStmt: this.updateAuthPinHashStmt,
      listMessagingProviderConfigsStmt: this.listMessagingProviderConfigsStmt,
      getMessagingProviderConfigByIdStmt: this.getMessagingProviderConfigByIdStmt,
      upsertMessagingProviderConfigStmt: this.upsertMessagingProviderConfigStmt,
      deleteAllOutboxEventsStmt: this.deleteAllOutboxEventsStmt,
      countAllOutboxEventsStmt: this.countAllOutboxEventsStmt,
      clearEmergencyStateStmt: this.clearEmergencyStateStmt,
      countAllVisitsStmt: this.countAllVisitsStmt,
      countVisitsByBusinessDayStmt: this.countVisitsByBusinessDayStmt,
      maxWaitMsByBusinessDayStmt: this.maxWaitMsByBusinessDayStmt,
      topicCountsByBusinessDayStmt: this.topicCountsByBusinessDayStmt,
      listOpenVisitsByBusinessDayStmt: this.listOpenVisitsByBusinessDayStmt,
      listAbsenceLookupTicketsStmt: this.listAbsenceLookupTicketsStmt,
      getVisitIdentityViewStmt: this.getVisitIdentityViewStmt,
      getVisitPortalContextStmt: this.getVisitPortalContextStmt,
      insertOutboxEventStmt: this.insertOutboxEventStmt,
      listPendingOutboxEventsStmt: this.listPendingOutboxEventsStmt,
      claimOutboxEventStmt: this.claimOutboxEventStmt,
      markOutboxPublishedStmt: this.markOutboxPublishedStmt,
      markOutboxRetryStmt: this.markOutboxRetryStmt,
      markOutboxDeadLetterStmt: this.markOutboxDeadLetterStmt,
      getOutboxStatusStmt: this.getOutboxStatusStmt,
      insertPatientSessionStmt: this.insertPatientSessionStmt,
      expireActiveSessionsByVisitStmt: this.expireActiveSessionsByVisitStmt,
      getActiveSessionByVisitStmt: this.getActiveSessionByVisitStmt,
      getPatientSessionByTokenStmt: this.getPatientSessionByTokenStmt,
      touchPatientSessionStmt: this.touchPatientSessionStmt,
      expirePatientSessionStmt: this.expirePatientSessionStmt,
      revokePatientSessionStmt: this.revokePatientSessionStmt,
      insertDocumentStmt: this.insertDocumentStmt,
      listPatientDocumentsStmt: this.listPatientDocumentsStmt,
      getSessionDocumentStmt: this.getSessionDocumentStmt,
      getDocumentByIdStmt: this.getDocumentByIdStmt,
      getDocumentExportInfoStmt: this.getDocumentExportInfoStmt,
      updateDocumentStatusStmt: this.updateDocumentStatusStmt,
      updateDocumentFileNameStmt: this.updateDocumentFileNameStmt,
      listDocumentsByVisitStmt: this.listDocumentsByVisitStmt,
    } = prepareCoreDatabaseStatements(this.db));
    this.deviceAuthorizationDeps = createDeviceAuthorizationDeps(this.db, nowIso);

    const setupStatements = createOpsSetupStatements(this.db);
    this.getOpsSetupStmt = setupStatements.getOpsSetupStmt;
    this.updateOpsSetupProgressStmt = setupStatements.updateOpsSetupProgressStmt;
    this.completeOpsSetupStmt = setupStatements.completeOpsSetupStmt;
    this.reopenOpsSetupStmt = setupStatements.reopenOpsSetupStmt;
    this.boundEmitOutboxEvent = this.emitOutboxEvent.bind(this);
    this.initializeFlowCore();
  }

  private initializeFlowCore(): void {
    syncFlowCoreCatalog(
      this.db,
      getOpsSettingsFromDb(buildOpsSettingsReadParams(this.getOpsSettingsStmt)),
    );
  }

  private commonHelperDeps() {
    return buildDatabaseCommonHelpers({
      getOpsSettings: () => this.getOpsSettings(),
      emitOutboxEvent: this.boundEmitOutboxEvent,
    });
  }

  setupDeps() {
    return {
      getOpsSetupStmt: this.getOpsSetupStmt,
      updateOpsSetupProgressStmt: this.updateOpsSetupProgressStmt,
      completeOpsSetupStmt: this.completeOpsSetupStmt,
      reopenOpsSetupStmt: this.reopenOpsSetupStmt,
      nowIso,
    };
  }

  private emitOutboxEvent(
    eventType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
  ): void {
    emitOutboxEventFromDb(this.outboxDeps(), eventType, aggregateId, payload);
  }

  private outboxDeps(): OutboxDeps {
    return {
      insertOutboxEventStmt: this.insertOutboxEventStmt,
      listPendingOutboxEventsStmt: this.listPendingOutboxEventsStmt,
      claimOutboxEventStmt: this.claimOutboxEventStmt,
      markOutboxPublishedStmt: this.markOutboxPublishedStmt,
      markOutboxRetryStmt: this.markOutboxRetryStmt,
      markOutboxDeadLetterStmt: this.markOutboxDeadLetterStmt,
      getOutboxStatusStmt: this.getOutboxStatusStmt,
      nowIso,
    };
  }

  private messagingDeps(): MessagingDeps {
    return {
      listMessagingProviderConfigsStmt: this.listMessagingProviderConfigsStmt,
      getMessagingProviderConfigByIdStmt: this.getMessagingProviderConfigByIdStmt,
      upsertMessagingProviderConfigStmt: this.upsertMessagingProviderConfigStmt,
      nowIso,
    };
  }

  private emergencyDeps(): EmergencyDeps {
    const common = this.commonHelperDeps();
    return {
      emergencyStateStmt: this.emergencyStateStmt,
      raiseEmergencyStmt: this.raiseEmergencyStmt,
      acknowledgeEmergencyStmt: this.acknowledgeEmergencyStmt,
      nowIso: common.nowIso,
      getOpsSettings: common.getOpsSettings,
      emitOutboxEvent: common.emitOutboxEvent,
    };
  }

  private runtimeResetDeps() {
    const common = this.commonHelperDeps();
    return {
      ...this.messagingDeps(),
      emergencyStateStmt: this.emergencyStateStmt,
      countAllVisitsStmt: this.countAllVisitsStmt,
      countAllOutboxEventsStmt: this.countAllOutboxEventsStmt,
      deleteAllOutboxEventsStmt: this.deleteAllOutboxEventsStmt,
      clearEmergencyStateStmt: this.clearEmergencyStateStmt,
      updateCheckinLockStmt: this.updateCheckinLockStmt,
      updateDayClosePhaseStmt: this.updateDayClosePhaseStmt,
      updateLastResetBusinessDayStmt: this.updateLastResetBusinessDayStmt,
      getOpsSettingsStmt: this.getOpsSettingsStmt,
      updateOpsSettingsStmt: this.updateOpsSettingsStmt,
      nowIso: common.nowIso,
      getBusinessDay: common.getBusinessDay,
      configuredExportBasePath: configuredExportBasePath(),
      emitOutboxEvent: common.emitOutboxEvent,
    };
  }

  private dayLifecycleDeps() {
    const common = this.commonHelperDeps();
    return {
      dayCloseStateStmt: this.dayCloseStateStmt,
      updateCheckinLockStmt: this.updateCheckinLockStmt,
      updateDayClosePhaseStmt: this.updateDayClosePhaseStmt,
      updateLastResetBusinessDayStmt: this.updateLastResetBusinessDayStmt,
      deleteAllOutboxEventsStmt: this.deleteAllOutboxEventsStmt,
      clearEmergencyStateStmt: this.clearEmergencyStateStmt,
      emergencyStateStmt: this.emergencyStateStmt,
      countAllVisitsStmt: this.countAllVisitsStmt,
      countVisitsByBusinessDayStmt: this.countVisitsByBusinessDayStmt,
      maxWaitMsByBusinessDayStmt: this.maxWaitMsByBusinessDayStmt,
      topicCountsByBusinessDayStmt: this.topicCountsByBusinessDayStmt,
      listOpenVisitsByBusinessDayStmt: this.listOpenVisitsByBusinessDayStmt,
      nowIso: common.nowIso,
      getBusinessDay: common.getBusinessDay,
      normalizeDayClosePhase,
      emitOutboxEvent: common.emitOutboxEvent,
    };
  }

  withTransaction<T>(operationName: string, fn: () => T): T {
    // Keep state changes and outbox inserts atomic in a single SQLite write transaction.
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      const reason = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
      if (!(error instanceof DomainError)) {
        log.warn({ error: reason, operationName }, 'Transaction rolled back');
      }
      throw error;
    }
  }

  /**
   * Write-TX for session reads that touch/expire. SESSION_EXPIRED commits so the
   * expire mark survives (requirePatientSessionFromDb writes then throws).
   */
  private withPatientSessionReadTx<T>(operationName: string, fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      if (error instanceof DomainError && error.domainCode === 'SESSION_EXPIRED') {
        this.db.exec('COMMIT');
        throw error;
      }
      this.db.exec('ROLLBACK');
      const reason = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
      if (!(error instanceof DomainError)) {
        log.warn({ error: reason, operationName }, 'Transaction rolled back');
      }
      throw error;
    }
  }

  private markAbsenceLookupDeps(): MarkAbsenceLookupDeps {
    const common = this.commonHelperDeps();
    return {
      getBusinessDay: common.getBusinessDay,
      getOpsSettings: common.getOpsSettings,
      findTicketByCodeStmt: this.findTicketByCodeStmt,
      listAbsenceLookupTicketsStmt: this.listAbsenceLookupTicketsStmt,
    };
  }

  private checkinSessionDeps(): CheckinSessionDeps {
    const common = this.commonHelperDeps();
    return {
      findTicketByCodeStmt: this.findTicketByCodeStmt,
      checkinLockStmt: this.checkinLockStmt,
      dayCloseStateStmt: this.dayCloseStateStmt,
      updateCheckinLockStmt: this.updateCheckinLockStmt,
      getVisitIdentityViewStmt: this.getVisitIdentityViewStmt,
      getVisitPortalContextStmt: this.getVisitPortalContextStmt,
      insertPatientSessionStmt: this.insertPatientSessionStmt,
      expireActiveSessionsByVisitStmt: this.expireActiveSessionsByVisitStmt,
      getActiveSessionByVisitStmt: this.getActiveSessionByVisitStmt,
      getPatientSessionByTokenStmt: this.getPatientSessionByTokenStmt,
      touchPatientSessionStmt: this.touchPatientSessionStmt,
      expirePatientSessionStmt: this.expirePatientSessionStmt,
      revokePatientSessionStmt: this.revokePatientSessionStmt,
      nowIso: common.nowIso,
      getBusinessDay: common.getBusinessDay,
      getBusinessTimeZone: resolveBusinessTimeZone,
      getOpsSettings: common.getOpsSettings,
      normalizeDayClosePhase,
      emitOutboxEvent: common.emitOutboxEvent,
    };
  }

  private documentDeps(): DocumentDeps {
    const common = this.commonHelperDeps();
    return {
      insertDocumentStmt: this.insertDocumentStmt,
      listPatientDocumentsStmt: this.listPatientDocumentsStmt,
      getSessionDocumentStmt: this.getSessionDocumentStmt,
      getDocumentByIdStmt: this.getDocumentByIdStmt,
      getDocumentExportInfoStmt: this.getDocumentExportInfoStmt,
      updateDocumentStatusStmt: this.updateDocumentStatusStmt,
      updateDocumentFileNameStmt: this.updateDocumentFileNameStmt,
      listDocumentsByVisitStmt: this.listDocumentsByVisitStmt,
      visitExists: (visitId) => visitExistsInDb(this.db, visitId),
      nowIso: common.nowIso,
      emitOutboxEvent: common.emitOutboxEvent,
      requirePatientSession: (sessionToken) =>
        requirePatientSessionFromDb(this.checkinSessionDeps(), sessionToken),
    };
  }

  isCheckinLocked(): boolean {
    return isCheckinLockedFromDb(this.checkinSessionDeps());
  }

  isEffectiveCheckinLocked(): boolean {
    return isEffectiveCheckinLockedFromDb(this.dayLifecycleDeps());
  }

  createTicket(input: CreateTicketCallerInput): {
    visitId: string;
    number: number;
    createdAt: string;
    destinationRoomLabel: string | null;
  } {
    return this.withTransaction('createTicket', () =>
      createVisitCheckInInDb({ ...this.checkinSessionDeps(), db: this.db }, input),
    );
  }

  resolvePatientSession(ticketCode: string, ttlMinutes = 30): SessionResolveResult {
    return this.withTransaction('resolvePatientSession', () =>
      resolvePatientSessionInDb(this.checkinSessionDeps(), ticketCode, ttlMinutes),
    );
  }

  verifyTicketCode(ticketCode: string): { visitId: string } {
    return verifyTicketCodeInDb(this.checkinSessionDeps(), ticketCode);
  }

  getTicketCodeByVisitId(visitId: string): string {
    return getTicketCodeByVisitIdFromDb(this.checkinSessionDeps(), visitId);
  }

  getPatientSession(sessionToken: string): PatientSession {
    return this.withPatientSessionReadTx('getPatientSession', () =>
      requirePatientSessionFromDb(this.checkinSessionDeps(), sessionToken),
    );
  }

  getPatientSessionMe(sessionToken: string): PatientSessionMe {
    return this.withPatientSessionReadTx('getPatientSessionMe', () =>
      getPatientSessionMeFromDb(this.checkinSessionDeps(), sessionToken),
    );
  }

  submitPatientSession(sessionToken: string): {
    sessionId: string;
    status: 'revoked';
    closedAt: string;
  } {
    return this.withTransaction('submitPatientSession', () =>
      submitPatientSessionInDb(this.checkinSessionDeps(), sessionToken),
    );
  }

  intakePatientDocument(
    sessionToken: string,
    input: {
      documentId?: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      status: DocumentStatus;
    },
  ): PatientDocumentRow {
    return this.withTransaction('intakePatientDocument', () =>
      intakePatientDocumentInDb(this.documentDeps(), sessionToken, {
        ...input,
        source: 'upload',
        templateId: null,
        templateVersion: null,
      }),
    );
  }

  intakeFormDocuments(
    sessionToken: string,
    inputs: FormDocumentIntakeInput[],
  ): PatientDocumentRow[] {
    return this.withTransaction('intakeFormDocuments', () =>
      intakeFormDocumentsInDb(this.documentDeps(), sessionToken, inputs),
    );
  }

  listPatientDocuments(sessionToken: string): PatientDocumentRow[] {
    return this.withPatientSessionReadTx('listPatientDocuments', () =>
      listPatientDocumentsInDb(this.documentDeps(), sessionToken),
    );
  }

  assertPatientDocumentDiscardable(sessionToken: string, documentId: string): void {
    return this.withPatientSessionReadTx('assertPatientDocumentDiscardable', () =>
      assertPatientDocumentDiscardableInDb(this.documentDeps(), sessionToken, documentId),
    );
  }

  discardPatientDocument(sessionToken: string, documentId: string): PatientDocumentRow {
    return this.withTransaction('discardPatientDocument', () =>
      discardPatientDocumentInDb(this.documentDeps(), sessionToken, documentId),
    );
  }

  getDocumentById(documentId: string): MfaDocumentRow {
    return getDocumentByIdFromDb(this.documentDeps(), documentId);
  }

  getDocumentExportInfo(documentId: string): DocumentExportInfo {
    return getDocumentExportInfoFromDb(this.documentDeps(), documentId);
  }

  getDocumentForPreviewRequest(documentId: string): MfaDocumentRow {
    return getDocumentForPreviewRequestFromDb(this.documentDeps(), documentId);
  }

  listDocumentsForVisit(visitId: string): MfaDocumentRow[] {
    return listDocumentsForVisitFromDb(this.documentDeps(), visitId);
  }

  requestDocumentPreview(documentId: string): MfaDocumentRow {
    return this.withTransaction('requestDocumentPreview', () =>
      requestDocumentPreviewInDb(this.documentDeps(), documentId),
    );
  }

  discardDocumentByMfa(documentId: string): MfaDocumentRow {
    return this.withTransaction('discardDocumentByMfa', () =>
      discardDocumentByMfaInDb(this.documentDeps(), documentId),
    );
  }

  renameDocumentFileName(documentId: string, baseName: string): MfaDocumentRow {
    return this.withTransaction('renameDocumentFileName', () =>
      renameDocumentFileNameInDb(this.documentDeps(), documentId, baseName),
    );
  }

  discardDocumentAfterMalware(documentId: string): MfaDocumentRow {
    return this.withTransaction('discardDocumentAfterMalware', () =>
      discardDocumentAfterMalwareInDb(this.documentDeps(), documentId),
    );
  }

  requestDocumentExport(documentId: string): MfaDocumentRow {
    return this.withTransaction('requestDocumentExport', () =>
      requestDocumentExportInDb(this.documentDeps(), documentId),
    );
  }

  completeDocumentExport(documentId: string): MfaDocumentRow {
    return this.withTransaction('completeDocumentExport', () =>
      completeDocumentExportInDb(this.documentDeps(), documentId),
    );
  }

  rollbackDocumentExportRequest(documentId: string): MfaDocumentRow {
    return this.withTransaction('rollbackDocumentExportRequest', () =>
      rollbackDocumentExportRequestInDb(this.documentDeps(), documentId),
    );
  }

  getFlowCoreRuntimeInstance(): ReturnType<typeof getFlowCoreRuntime> {
    return getFlowCoreRuntime(this.db);
  }

  /** Visit-only queue (Phase A). Legacy ticket merge removed — Phase B drops tickets/queue_entries. */
  listQueue(): QueueVisitRow[] {
    return listVisitQueueRows(
      getFlowCoreRuntime(this.db),
      this.getOpsSettings(),
      this.commonHelperDeps().getBusinessDay(),
      this.db,
    );
  }

  processExpiredRecallWindows(): string[] {
    return this.withTransaction('processExpiredRecallWindows', () => {
      const runtime = getFlowCoreRuntime(this.db);
      const businessDay = this.commonHelperDeps().getBusinessDay();
      const nowIso = this.commonHelperDeps().nowIso();
      const visitIds = listExpiredVisitRecallWindows(this.db, businessDay, nowIso);
      const transitioned: string[] = [];
      for (const visitId of visitIds) {
        if (this.processExpiredRecallWindowForVisitInTransaction(visitId, runtime, nowIso)) {
          transitioned.push(visitId);
        }
      }
      return transitioned;
    });
  }

  processExpiredRecallWindowForVisit(visitId: string): boolean {
    return this.withTransaction('processExpiredRecallWindowForVisit', () => {
      requireVisitExistsInDb(this.db, visitId);
      const runtime = getFlowCoreRuntime(this.db);
      const nowIso = this.commonHelperDeps().nowIso();
      return this.processExpiredRecallWindowForVisitInTransaction(visitId, runtime, nowIso);
    });
  }

  private processExpiredRecallWindowForVisitInTransaction(
    visitId: string,
    runtime: ReturnType<typeof getFlowCoreRuntime>,
    nowIso: string,
  ): boolean {
    const result = processExpiredRecallWindowForVisit(this.db, runtime, visitId, nowIso);
    if (!result?.transitioned) {
      return false;
    }
    this.emitOutboxEvent('QueueStatusChanged', visitId, {
      visitId: visitId,
      fromStatus: result.fromStatus,
      toStatus: result.toStatus,
      updatedAt: nowIso,
      returnUntil: null,
    });
    return true;
  }

  getQueueSummary(): QueueSummary {
    return countVisitQueueSummary(
      getFlowCoreRuntime(this.db),
      this.db,
      this.commonHelperDeps().getBusinessDay(),
    );
  }

  callVisit(
    visitId: string,
    roomId?: string,
    roomLabel?: string,
    actorId?: string,
  ): { fromStatus: QueueDisplayStatus; toStatus: QueueDisplayStatus } {
    return this.withTransaction('callVisit', () => {
      requireVisitExistsInDb(this.db, visitId);
      const updatedAt = this.commonHelperDeps().nowIso();
      const transition = callVisit(
        this.db,
        getFlowCoreRuntime(this.db),
        this.getOpsSettings(),
        () => this.listQueue(),
        visitId,
        roomId,
        roomLabel,
        actorId,
      );
      this.emitOutboxEvent('QueueStatusChanged', visitId, {
        visitId: visitId,
        fromStatus: transition.fromStatus,
        toStatus: transition.toStatus,
        updatedAt,
        roomId: roomId ?? null,
        roomLabel: roomLabel ?? null,
      });
      return transition;
    });
  }

  checkInRoom(
    visitId: string,
    actingRoomId?: string,
    actorId?: string,
  ): { fromStatus: QueueDisplayStatus; toStatus: QueueDisplayStatus } {
    return this.withTransaction('checkInRoom', () => {
      requireVisitExistsInDb(this.db, visitId);
      const updatedAt = this.commonHelperDeps().nowIso();
      const transition = arriveVisit(
        this.db,
        getFlowCoreRuntime(this.db),
        visitId,
        actingRoomId,
        actorId,
      );
      this.emitOutboxEvent('QueueStatusChanged', visitId, {
        visitId: visitId,
        fromStatus: transition.fromStatus,
        toStatus: transition.toStatus,
        updatedAt,
        roomId: null,
        roomLabel: null,
      });
      return transition;
    });
  }

  placeVisitInRoom(
    visitId: string,
    roomId: string,
    roomLabel?: string,
    actingRoomId?: string,
    actorId?: string,
  ): PlacementTransition {
    return this.withTransaction('placeVisitInRoom', () => {
      requireVisitExistsInDb(this.db, visitId);
      const updatedAt = this.commonHelperDeps().nowIso();
      const transition = runPlaceVisitInRoom({
        db: this.db,
        runtime: getFlowCoreRuntime(this.db),
        settings: this.getOpsSettings(),
        listQueue: () => this.listQueue(),
        visitId,
        roomId,
        roomLabel,
        actingRoomId,
        actorId,
      });
      this.emitOutboxEvent('QueueStatusChanged', visitId, {
        visitId,
        fromStatus: transition.fromStatus,
        toStatus: transition.toStatus,
        updatedAt,
        roomId: transition.roomId,
        roomLabel: transition.roomLabel,
      });
      return transition;
    });
  }

  startTreatment(
    visitId: string,
    actingRoomId?: string,
    actorId?: string,
  ): { fromStatus: QueueDisplayStatus; toStatus: QueueDisplayStatus } {
    return this.withTransaction('startTreatment', () => {
      requireVisitExistsInDb(this.db, visitId);
      const updatedAt = this.commonHelperDeps().nowIso();
      const transition = startVisit(getFlowCoreRuntime(this.db), visitId, actingRoomId, actorId);
      this.emitOutboxEvent('QueueStatusChanged', visitId, {
        visitId: visitId,
        fromStatus: transition.fromStatus,
        toStatus: transition.toStatus,
        updatedAt,
        roomId: null,
        roomLabel: null,
      });
      return transition;
    });
  }

  continueJourney(
    visitId: string,
    roomId?: string,
    roomLabel?: string,
    actorId?: string,
  ): {
    fromStatus: QueueDisplayStatus;
    toStatus: QueueDisplayStatus;
  } {
    return this.withTransaction('continueJourney', () => {
      requireVisitExistsInDb(this.db, visitId);
      const updatedAt = this.commonHelperDeps().nowIso();
      const transition = continueJourneyVisit(
        getFlowCoreRuntime(this.db),
        this.getOpsSettings(),
        () => this.listQueue(),
        visitId,
        roomId,
        actorId,
      );
      this.emitOutboxEvent('QueueStatusChanged', visitId, {
        visitId: visitId,
        fromStatus: transition.fromStatus,
        toStatus: transition.toStatus,
        updatedAt,
        roomId: roomId ?? null,
        roomLabel: roomLabel ?? null,
      });
      return transition;
    });
  }

  reassignRoom(
    visitId: string,
    roomId?: string,
    roomLabel?: string,
    actorId?: string,
  ): { fromStatus: QueueDisplayStatus; toStatus: QueueDisplayStatus } {
    return this.withTransaction('reassignRoom', () => {
      requireVisitExistsInDb(this.db, visitId);
      const updatedAt = this.commonHelperDeps().nowIso();
      const transition = reassignVisitRoom(
        this.db,
        getFlowCoreRuntime(this.db),
        this.getOpsSettings(),
        () => this.listQueue(),
        visitId,
        roomId,
        roomLabel,
        actorId,
      );
      this.emitOutboxEvent('QueueStatusChanged', visitId, {
        visitId: visitId,
        fromStatus: transition.fromStatus,
        toStatus: transition.toStatus,
        updatedAt,
        roomId: roomId ?? null,
        roomLabel: roomLabel ?? null,
      });
      return transition;
    });
  }

  checkOutRoom(
    visitId: string,
    actingRoomId?: string,
    actorId?: string,
  ): { fromStatus: QueueDisplayStatus; toStatus: QueueDisplayStatus } {
    return this.withTransaction('checkOutRoom', () => {
      requireVisitExistsInDb(this.db, visitId);
      const updatedAt = this.commonHelperDeps().nowIso();
      const transition = completeVisit(getFlowCoreRuntime(this.db), visitId, actingRoomId, actorId);
      this.emitOutboxEvent('QueueStatusChanged', visitId, {
        visitId: visitId,
        fromStatus: transition.fromStatus,
        toStatus: transition.toStatus,
        updatedAt,
        roomId: null,
        roomLabel: null,
      });
      return transition;
    });
  }

  cancelQueueVisit(
    visitId: string,
    actorId?: string,
  ): {
    fromStatus: QueueDisplayStatus;
    toStatus: QueueDisplayStatus;
  } {
    return this.withTransaction('cancelQueueVisit', () => {
      requireVisitExistsInDb(this.db, visitId);
      const updatedAt = this.commonHelperDeps().nowIso();
      const transition = cancelVisit(this.db, getFlowCoreRuntime(this.db), visitId, actorId);
      this.emitOutboxEvent('QueueStatusChanged', visitId, {
        visitId: visitId,
        fromStatus: transition.fromStatus,
        toStatus: transition.toStatus,
        updatedAt,
        roomId: null,
        roomLabel: null,
      });
      return transition;
    });
  }

  returnToWaiting(
    visitId: string,
    actorId?: string,
  ): {
    fromStatus: QueueDisplayStatus;
    toStatus: QueueDisplayStatus;
  } {
    const transition = this.withTransaction('returnToWaiting', () => {
      requireVisitExistsInDb(this.db, visitId);
      const updatedAt = this.commonHelperDeps().nowIso();
      const runtime = getFlowCoreRuntime(this.db);
      const absentTransition = returnAbsentVisitToQueue(this.db, runtime, visitId, updatedAt);
      const result = absentTransition ?? returnVisitToWaiting(runtime, visitId, actorId);
      if (!absentTransition) {
        clearAbsentMode(this.db, visitId, updatedAt);
      }
      this.emitOutboxEvent('QueueStatusChanged', visitId, {
        visitId: visitId,
        fromStatus: result.fromStatus,
        toStatus: result.toStatus,
        updatedAt,
        roomId: null,
        roomLabel: null,
      });
      return result;
    });
    cancelRecallWindowExpiry(visitId);
    return transition;
  }

  setAbsence(
    visitId: string,
    mode: AbsenceMode,
  ): { fromStatus: QueueDisplayStatus; toStatus: QueueDisplayStatus } {
    return this.withTransaction('setAbsence', () => {
      requireVisitExistsInDb(this.db, visitId);
      const updatedAt = this.commonHelperDeps().nowIso();
      const transition = setVisitAbsent(
        this.db,
        getFlowCoreRuntime(this.db),
        this.getOpsSettings(),
        visitId,
        mode,
        updatedAt,
      );
      this.emitOutboxEvent('QueueStatusChanged', visitId, {
        visitId: visitId,
        fromStatus: transition.fromStatus,
        toStatus: transition.toStatus,
        updatedAt,
        absenceMode: mode,
        roomId: null,
        roomLabel: null,
      });
      return transition;
    });
  }

  setCallbackPhone(
    visitId: string,
    callbackPhone: string,
  ): { callbackPhone: string; updatedAt: string } {
    return this.withTransaction('setCallbackPhone', () => {
      requireVisitExistsInDb(this.db, visitId);
      return setVisitCallbackPhone(
        this.db,
        getFlowCoreRuntime(this.db),
        this.getOpsSettings(),
        visitId,
        callbackPhone,
        this.commonHelperDeps().nowIso(),
      );
    });
  }

  clearCallbackPhone(visitId: string): { updatedAt: string } {
    return this.withTransaction('clearCallbackPhone', () => {
      requireVisitExistsInDb(this.db, visitId);
      return clearVisitCallbackPhone(
        this.db,
        getFlowCoreRuntime(this.db),
        this.getOpsSettings(),
        visitId,
        this.commonHelperDeps().nowIso(),
      );
    });
  }

  setIdentityRef(visitId: string, identityRef: string): { identityRef: string; updatedAt: string } {
    return this.withTransaction('setIdentityRef', () => {
      requireVisitExistsInDb(this.db, visitId);
      return setVisitIdentityRef(
        this.db,
        getFlowCoreRuntime(this.db),
        visitId,
        identityRef,
        this.commonHelperDeps().nowIso(),
      );
    });
  }

  supersedeVisit(
    visitId: string,
    topicId: string,
    actorId?: string,
  ): {
    supersededVisitId: string;
    visitId: string;
    laneCode: string;
    number: number;
    topicId: string;
    topicLabel: string;
    destinationRoomLabel: string | null;
    checkedInAt: string;
    documentsRebound: number;
  } {
    return this.withTransaction('supersedeVisit', () => {
      requireVisitExistsInDb(this.db, visitId);
      const result = supersedeVisitTopic({
        db: this.db,
        runtime: getFlowCoreRuntime(this.db),
        settings: this.getOpsSettings(),
        visitId,
        topicId,
        actorId,
      });
      this.emitOutboxEvent('VisitSuperseded', result.visitId, {
        supersededVisitId: result.supersededVisitId,
        visitId: result.visitId,
        topicId: result.topicId,
        laneCode: result.laneCode,
        number: result.number,
        correlationId: result.correlationId,
        documentsRebound: result.documentsRebound,
      });
      return {
        supersededVisitId: result.supersededVisitId,
        visitId: result.visitId,
        laneCode: result.laneCode,
        number: result.number,
        topicId: result.topicId,
        topicLabel: result.topicLabel,
        destinationRoomLabel: result.destinationRoomLabel,
        checkedInAt: result.checkedInAt,
        documentsRebound: result.documentsRebound,
      };
    });
  }

  cycleTriage(visitId: string): { triageLevel: TriageLevel | null; updatedAt: string } {
    return this.withTransaction('cycleTriage', () => {
      requireVisitExistsInDb(this.db, visitId);
      return cycleVisitTriageLevel(
        this.db,
        getFlowCoreRuntime(this.db),
        this.getOpsSettings(),
        visitId,
        this.commonHelperDeps().nowIso(),
      );
    });
  }

  async markAbsenceByLookup(
    input: MarkAbsenceLookupInput,
  ): Promise<{ visitId: string; fromStatus: QueueDisplayStatus; toStatus: QueueDisplayStatus }> {
    const mode = input.mode ?? 'wait_here';
    const ticket = await resolveMarkAbsenceTicket(this.markAbsenceLookupDeps(), input);
    const transition = this.setAbsence(ticket.id, mode);
    return {
      visitId: ticket.id,
      ...transition,
    };
  }

  recallVisit(
    visitId: string,
    returnWindowMinutes?: number,
  ): {
    fromStatus: QueueDisplayStatus;
    toStatus: QueueDisplayStatus;
    returnUntil: string;
    returnWindowMinutes: number;
    callbackPhone: string | null;
    checkinLocale: string | null;
  } {
    const result = this.withTransaction('recallVisit', () => {
      requireVisitExistsInDb(this.db, visitId);
      const settings = this.getOpsSettings();
      const windowMinutes = returnWindowMinutes ?? settings.returnWindowMinutes;
      const updatedAt = this.commonHelperDeps().nowIso();
      const recall = recallVisit(
        this.db,
        getFlowCoreRuntime(this.db),
        settings,
        visitId,
        windowMinutes,
        updatedAt,
      );
      this.emitOutboxEvent('QueueStatusChanged', visitId, {
        visitId: visitId,
        fromStatus: recall.fromStatus,
        toStatus: recall.toStatus,
        updatedAt,
        returnUntil: recall.returnUntil,
      });
      return recall;
    });
    scheduleRecallWindowExpiry(this, visitId, Date.parse(result.returnUntil));
    return result;
  }

  setRecallNotifyError(visitId: string, errorCode: string | null): void {
    this.withTransaction('setRecallNotifyError', () => {
      requireVisitExistsInDb(this.db, visitId);
      setVisitRecallNotifyError(this.db, visitId, errorCode, this.commonHelperDeps().nowIso());
    });
  }

  setRecallNotifySent(visitId: string, sent: boolean): void {
    this.withTransaction('setRecallNotifySent', () => {
      requireVisitExistsInDb(this.db, visitId);
      setVisitRecallNotifySent(this.db, visitId, sent, this.commonHelperDeps().nowIso());
    });
  }

  retryRecallNotify(visitId: string): {
    returnUntil: string;
    returnWindowMinutes: number;
    callbackPhone: string;
    checkinLocale: string | null;
  } {
    return this.withTransaction('retryRecallNotify', () => {
      requireVisitExistsInDb(this.db, visitId);
      return readVisitRecallNotifyRetryContext(this.db, visitId, this.commonHelperDeps().nowIso());
    });
  }

  claimPendingOutboxEvents(limit: number, leaseMs: number): OutboxEventRow[] {
    return this.withTransaction('claimPendingOutboxEvents', () =>
      claimPendingOutboxEventsInDb(this.outboxDeps(), limit, leaseMs),
    );
  }

  markOutboxPublished(eventId: string): void {
    this.withTransaction('markOutboxPublished', () =>
      markOutboxPublishedInDb(this.outboxDeps(), eventId),
    );
  }

  markOutboxRetry(eventId: string, nextAttemptAt: string, lastError: string): void {
    this.withTransaction('markOutboxRetry', () =>
      markOutboxRetryInDb(this.outboxDeps(), eventId, nextAttemptAt, lastError),
    );
  }

  markOutboxDeadLetter(eventId: string, lastError: string): void {
    this.withTransaction('markOutboxDeadLetter', () =>
      markOutboxDeadLetterInDb(this.outboxDeps(), eventId, lastError),
    );
  }

  getOutboxStatus(): OutboxStatus {
    return getOutboxStatusFromDb(this.outboxDeps());
  }

  setCheckinLock(locked: boolean): { checkinLocked: boolean; updatedAt: string } {
    return this.withTransaction('setCheckinLock', () =>
      setCheckinLockInDb(this.checkinSessionDeps(), locked),
    );
  }

  getOpsState(): { checkinLocked: boolean; dayClosePhase: DayClosePhase } {
    return getOpsStateFromDb(this.checkinSessionDeps());
  }

  getVisitIdentityView(visitIdRaw: string): VisitIdentityView {
    return getVisitIdentityViewFromDb(this.checkinSessionDeps(), visitIdRaw);
  }

  getEmergencyState(): EmergencyState {
    return getEmergencyStateFromDb(this.emergencyDeps());
  }

  raiseEmergency(source: 'terminal' | 'mfa'): EmergencyRaiseResult {
    return this.withTransaction('raiseEmergency', () =>
      raiseEmergencyInDb(this.emergencyDeps(), source),
    );
  }

  acknowledgeEmergency(emergencyIdRaw: string): EmergencyAcknowledgeResult {
    return this.withTransaction('acknowledgeEmergency', () =>
      acknowledgeEmergencyInDb(this.emergencyDeps(), emergencyIdRaw),
    );
  }

  getDayLifecycleState(): DayLifecycleState {
    return getDayLifecycleStateFromDb(this.dayLifecycleDeps());
  }

  getMessagingProviderCatalog(): MessagingProviderCatalog {
    return getMessagingProviderCatalogFromDb(this.messagingDeps());
  }

  updateMessagingProviderConfig(
    providerId: string,
    patch: {
      enabled?: boolean;
      credentials?: Record<string, unknown>;
    },
  ): MessagingProviderCatalog['channels'][number]['providers'][number] {
    return this.withTransaction('updateMessagingProviderConfig', () =>
      updateMessagingProviderConfigInDb(this.messagingDeps(), providerId, patch),
    );
  }

  getAuthSettings(): AuthSettings {
    return getAuthSettingsFromDb({ getAuthSettingsStmt: this.getAuthSettingsStmt });
  }

  updateAuthPinHash(target: AuthPinTarget, pinHash: string): AuthSettings {
    return this.withTransaction('updateAuthPinHash', () =>
      updateAuthPinHashInDb(
        {
          getAuthSettingsStmt: this.getAuthSettingsStmt,
          updateAuthPinHashStmt: this.updateAuthPinHashStmt,
          nowIso,
        },
        target,
        pinHash,
      ),
    );
  }

  createSlotDeviceAuthorization(input: {
    role: DeviceSlotRole;
    deviceId: string;
    token: string;
  }): DeviceAuthorizationRow {
    return this.withTransaction('createSlotDeviceAuthorization', () =>
      createSlotDeviceAuthorization(this.deviceAuthorizationDeps, input),
    );
  }

  replaceSlotDeviceAuthorization(input: {
    role: DeviceSlotRole;
    deviceId: string;
    token: string;
  }): DeviceAuthorizationRow {
    return this.withTransaction('replaceSlotDeviceAuthorization', () =>
      replaceSlotDeviceAuthorization(this.deviceAuthorizationDeps, input),
    );
  }

  enrollRoomPanelDeviceAuthorization(input: {
    roomId: string;
    placement: RoomPanelPlacement;
    token: string;
  }): DeviceAuthorizationRow {
    return this.withTransaction('enrollRoomPanelDeviceAuthorization', () =>
      enrollRoomPanelDeviceAuthorization(this.deviceAuthorizationDeps, input),
    );
  }

  authenticateDeviceAuthorization(token: string): DeviceAuthorizationRow | null {
    return authenticateDeviceAuthorizationInDb(this.deviceAuthorizationDeps, token);
  }

  getDeviceAuthorizationById(authorizationId: string): DeviceAuthorizationRow | null {
    return getDeviceAuthorizationById(this.deviceAuthorizationDeps, authorizationId);
  }

  listActiveDeviceAuthorizations(): DeviceAuthorizationRow[] {
    return listActiveDeviceAuthorizations(this.deviceAuthorizationDeps);
  }

  touchDeviceAuthorization(authorizationId: string): DeviceAuthorizationRow | null {
    return touchDeviceAuthorization(this.deviceAuthorizationDeps, authorizationId);
  }

  revokeDeviceAuthorizationById(authorizationId: string): boolean {
    return this.withTransaction('revokeDeviceAuthorizationById', () =>
      revokeDeviceAuthorizationById(this.deviceAuthorizationDeps, authorizationId),
    );
  }

  revokeDeviceAuthorizationByToken(token: string): boolean {
    return this.withTransaction('revokeDeviceAuthorizationByToken', () => {
      const row = authenticateDeviceAuthorizationInDb(this.deviceAuthorizationDeps, token);
      if (!row) {
        return false;
      }
      return revokeDeviceAuthorizationById(this.deviceAuthorizationDeps, row.authorizationId);
    });
  }

  revokeDeviceAuthorizationsByDevice(role: DeviceSlotRole, deviceId: string): number {
    return this.withTransaction('revokeDeviceAuthorizationsByDevice', () =>
      revokeDeviceAuthorizationsByDevice(this.deviceAuthorizationDeps, role, deviceId),
    );
  }

  revokeRoomPanelAuthorizationsByRoom(roomId: string): number {
    return this.withTransaction('revokeRoomPanelAuthorizationsByRoom', () =>
      revokeRoomPanelAuthorizationsByRoom(this.deviceAuthorizationDeps, roomId),
    );
  }

  revokeRoomPanelAuthorizationsByPlacement(roomId: string, placement: RoomPanelPlacement): number {
    return this.withTransaction('revokeRoomPanelAuthorizationsByPlacement', () =>
      revokeRoomPanelAuthorizationsByPlacement(this.deviceAuthorizationDeps, roomId, placement),
    );
  }

  revokeAllRoomPanelAuthorizations(): number {
    return this.withTransaction('revokeAllRoomPanelAuthorizations', () =>
      revokeAllRoomPanelAuthorizations(this.deviceAuthorizationDeps),
    );
  }

  importActiveDeviceAuthorizations(rows: DeviceAuthorizationCopyRow[]): number {
    return this.withTransaction('importActiveDeviceAuthorizations', () =>
      importActiveDeviceAuthorizations(this.deviceAuthorizationDeps, rows),
    );
  }

  getMessagingProviderRuntimeConfig(providerId: string): {
    providerId: string;
    enabled: boolean;
    credentials: Record<string, string>;
  } {
    return getMessagingProviderRuntimeConfigFromDb(this.messagingDeps(), providerId);
  }

  getOpsSettings(): OpsSettings {
    return getOpsSettingsFromDb(buildOpsSettingsReadParams(this.getOpsSettingsStmt));
  }

  getRoutingCapabilities(): RoutingCapabilities {
    return resolveRoutingCapabilities(this.getOpsSettings(), countOpenVisits(this.db));
  }

  updateOpsSettings(patch: OpsSettingsPatch): OpsSettings {
    return this.withTransaction('updateOpsSettings', () => {
      const current = this.getOpsSettings();
      if (patch.rooms) {
        const nextRooms = ensureSingleDefaultCallTarget(patch.rooms);
        const guard = validateRoomSettingsChange({
          currentRooms: current.rooms,
          nextRooms,
          topics: patch.topics ?? current.topics,
          queueTickets: this.listQueue(),
        });
        if (!guard.ok) {
          throw new OpsSettingsValidationError(guard.message, {
            apiCode: guard.code,
            details: guard.details,
          });
        }
      }

      const nextRoutingMode = patch.routingMode ?? current.routingMode;
      if (nextRoutingMode !== current.routingMode) {
        const licenseGuard = validateComplexRoutingLicenseChange({
          nextMode: nextRoutingMode,
        });
        if (!licenseGuard.ok) {
          throw new OpsSettingsValidationError(licenseGuard.message, {
            apiCode: licenseGuard.code,
          });
        }

        const modeGuard = validateRoutingModeChange({
          currentMode: current.routingMode,
          nextMode: nextRoutingMode,
          db: this.db,
        });
        if (!modeGuard.ok) {
          throw new OpsSettingsValidationError(modeGuard.message, {
            apiCode: modeGuard.code,
            details: { openVisitCount: modeGuard.openVisitCount },
          });
        }
      }

      const nextJourneySettings = patch.journeySettings ?? current.journeySettings;
      if (patch.journeySettings) {
        const journeyGuard = validateJourneySettingsEditable(
          this.db,
          current.journeySettings,
          nextJourneySettings,
        );
        if (!journeyGuard.ok) {
          throw new OpsSettingsValidationError(journeyGuard.message, {
            apiCode: journeyGuard.code,
            details: {
              templateId: journeyGuard.templateId,
              openVisitCount: journeyGuard.openVisitCount,
            },
          });
        }
      }

      const next = updateOpsSettingsInDb(
        buildOpsSettingsWriteParams(this.getOpsSettingsStmt, this.updateOpsSettingsStmt),
        patch,
      );
      syncFlowCoreCatalog(this.db, next);
      return next;
    });
  }

  exportSettingsSnapshot(env: Record<string, string>): SettingsSnapshotV1 {
    return exportSettingsSnapshotFromDb(this.db, env);
  }

  exportSettingsDbSnapshot(): SettingsSnapshotDbV1 {
    return exportSettingsDbSnapshotFromDb(this.db);
  }

  importSettingsSnapshot(
    snapshot: unknown,
    options?: SettingsSnapshotImportOptions,
  ): SettingsSnapshotImportResult {
    return importSettingsSnapshotIntoDb(this.db, snapshot, options);
  }

  async getSetupStatus(): Promise<SetupStatusSnapshot> {
    return readSetupStatusSnapshot(this, { verify: false });
  }

  async verifySetupStatus(): Promise<SetupStatusSnapshot> {
    return readSetupStatusSnapshot(this, { verify: true });
  }

  updateSetupProgress(patch: {
    lastStep?: SetupWizardStep;
    portalEnabled?: boolean;
    contactMode?: SetupContactMode;
  }) {
    return persistSetupProgress(this, patch);
  }

  isPortalEnabled(): boolean {
    return getOpsSetupFromDb(this.setupDeps()).portalEnabled;
  }

  applySetupContactSample(): void {
    this.withTransaction('applySetupContactSample', () => {
      applyDemoContactLookupSettings(this.db);
      updateOpsSetupProgressInDb(this.setupDeps(), { contactMode: 'sample' });
    });
  }

  async completeSetup(): Promise<{ setupCompletedAt: string; status: SetupStatusSnapshot }> {
    return completeSetupInDb(this);
  }

  async reopenSetup(): Promise<SetupStatusSnapshot> {
    return reopenSetupInDb(this);
  }

  startDayClose(): { dayClosePhase: DayClosePhase; updatedAt: string } {
    return this.withTransaction('startDayClose', () => startDayCloseInDb(this.dayLifecycleDeps()));
  }

  resetBusinessDay(): {
    dayClosePhase: DayClosePhase;
    resetVisitCount: number;
    updatedAt: string;
    lastResetBusinessDay: string;
    emergencyCleared: boolean;
    sandboxRestartRequired: true;
  } {
    const result = this.withTransaction('resetBusinessDay', () => {
      const resetResult = resetBusinessDayInDb(this.dayLifecycleDeps());
      clearFlowCoreVisitRuntime(this.db);
      resetFlowCoreRuntimeForTests();
      return resetResult;
    });
    clearAllRecallWindowExpiries();
    return result;
  }

  getRuntimeResetPreview(): RuntimeResetPreview {
    return getRuntimeResetPreviewFromDb(this.runtimeResetDeps(), RUNTIME_RESET_CONFIRM_PHRASE);
  }

  executeRuntimeReset(): RuntimeResetResult {
    const result = this.withTransaction('executeRuntimeReset', () => {
      const resetResult = executeRuntimeResetInDb(this.runtimeResetDeps());
      clearFlowCoreVisitRuntime(this.db);
      resetFlowCoreRuntimeForTests();
      return resetResult;
    });
    clearAllRecallWindowExpiries();
    return result;
  }
}

let coreDbInstance: CoreDatabase | null = null;

export function getCoreDatabase(): CoreDatabase {
  if (!coreDbInstance) {
    const dbPath = process.env.DB_PATH ?? '/var/lib/praxis-flow/app/praxis-flow.db';
    coreDbInstance = new CoreDatabase(dbPath);
  }
  return coreDbInstance;
}
