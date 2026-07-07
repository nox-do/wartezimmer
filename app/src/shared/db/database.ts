import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { createLogger } from '../logging/logger.js';
import { runMigrations } from './migrations-runner.js';
import {
  applyDemoContactLookupSettings,
  ensureDemoContactLookupSeed,
} from '../contacts/ensure-demo-contact-csv.js';
import { ensurePracticeProfileSeedFromEnv } from '../practice/ensure-practice-profile-seed.js';
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
import { clearFlowCoreVisitRuntime, ensureFlowCoreSchema } from '../flow-core/flow-core-schema.js';
import {
  arriveVisit,
  callVisit,
  clearVisitCallbackPhone,
  completeVisit,
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
  visitExistsInDb,
  requireVisitExistsInDb,
} from '../flow-core/visit-queue-bridge.js';
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
import { validateComplexRoutingLicenseChange, validateRoutingModeChange } from '../ops/routing-mode-guard.js';
import { validateJourneySettingsEditable } from '../ops/journey-template-guard.js';
import { OpsSettingsValidationError } from './ops-settings-errors.js';
import {
  createOpsSetupStatements,
  getOpsSetupFromDb,
  ensureOpsSetupSchema,
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
  scheduleRecallWindowExpiry,
} from '../queue/recall-window-expiry-scheduler.js';
import {
  cancelTerminalAssistPendingExpiry,
  clearAllTerminalAssistPendingExpiries,
  scheduleTerminalAssistPendingExpiry,
} from '../checkin/terminal-assist-pending-expiry-scheduler.js';
import {
  clearAllTerminalAssistPending,
  clearTerminalAssistPending,
  ensureTerminalAssistPendingSchema,
  expireTerminalAssistPending,
  getTerminalAssistPending as getTerminalAssistPendingRow,
  isTerminalAssistPendingActive,
  listActiveTerminalAssistPending,
  upsertTerminalAssistPending,
  type TerminalAssistPendingRow,
} from '../checkin/terminal-assist-pending.js';
import {
  resolveMarkAbsenceTicket,
  type MarkAbsenceLookupDeps,
  type MarkAbsenceLookupInput,
} from '../queue/mark-absence-lookup.js';
import {
  completeDocumentExportInDb,
  discardDocumentByMfaInDb,
  renameDocumentFileNameInDb,
  discardDocumentAfterMalwareInDb,
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
  assertTerminalAssistPressAllowed,
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
  ensureAuthSettingsSchema,
  getAuthSettingsFromDb,
  updateAuthPinHashInDb,
  type AuthPinTarget,
  type AuthSettings,
} from './database-auth-settings.js';
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
  QueueSummary,
  QueueVisitRow,
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

const log = createLogger('db.core');

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

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');

    runMigrations(this.db);
    ensureOpsSetupSchema(this.db);
    ensureTerminalAssistPendingSchema(this.db);
    ensureAuthSettingsSchema(this.db);
    ensureDemoContactLookupSeed(this.db);
    ensurePracticeProfileSeedFromEnv(this.db);
    ensureFlowCoreSchema(this.db);
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

    const setupStatements = createOpsSetupStatements(this.db);
    this.getOpsSetupStmt = setupStatements.getOpsSetupStmt;
    this.updateOpsSetupProgressStmt = setupStatements.updateOpsSetupProgressStmt;
    this.completeOpsSetupStmt = setupStatements.completeOpsSetupStmt;
    this.reopenOpsSetupStmt = setupStatements.reopenOpsSetupStmt;
    this.boundEmitOutboxEvent = this.emitOutboxEvent.bind(this);
    this.initializeFlowCore();
  }

  private initializeFlowCore(): void {
    syncFlowCoreCatalog(this.db, getOpsSettingsFromDb(buildOpsSettingsReadParams(this.getOpsSettingsStmt)));
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
        log.warn(`Transaction rolled back: ${operationName}`, { error: reason });
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
  } {
    return this.withTransaction('createTicket', () =>
      createVisitCheckInInDb({ ...this.checkinSessionDeps(), db: this.db }, input),
    );
  }

  pressTerminalAssist(deviceId: string): TerminalAssistPendingRow {
    return this.withTransaction('pressTerminalAssist', () => {
      assertTerminalAssistPressAllowed(this.checkinSessionDeps());
      const row = upsertTerminalAssistPending(this.db, deviceId);
      scheduleTerminalAssistPendingExpiry(this, row.deviceId, Date.parse(row.expiresAt));
      return row;
    });
  }

  releaseTerminalAssist(deviceId: string): boolean {
    return this.withTransaction('releaseTerminalAssist', () => {
      cancelTerminalAssistPendingExpiry(deviceId);
      return clearTerminalAssistPending(this.db, deviceId);
    });
  }

  getTerminalAssistPending(deviceId: string, nowMs = Date.now()): TerminalAssistPendingRow | null {
    return getTerminalAssistPendingRow(this.db, deviceId, nowMs);
  }

  listActiveTerminalAssistPending(nowMs = Date.now()): TerminalAssistPendingRow[] {
    return listActiveTerminalAssistPending(this.db, nowMs);
  }

  isTerminalAssistPendingActive(deviceId: string, nowMs = Date.now()): boolean {
    return isTerminalAssistPendingActive(this.db, deviceId, nowMs);
  }

  expireTerminalAssistPending(deviceId: string, nowMs = Date.now()): boolean {
    return expireTerminalAssistPending(this.db, deviceId, nowMs);
  }

  clearAllTerminalAssistPending(): number {
    return this.withTransaction('clearAllTerminalAssistPending', () => {
      clearAllTerminalAssistPendingExpiries();
      return clearAllTerminalAssistPending(this.db);
    });
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
    return requirePatientSessionFromDb(this.checkinSessionDeps(), sessionToken);
  }

  getPatientSessionMe(sessionToken: string): PatientSessionMe {
    return getPatientSessionMeFromDb(this.checkinSessionDeps(), sessionToken);
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
    return listPatientDocumentsInDb(this.documentDeps(), sessionToken);
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
  ): { fromStatus: string; toStatus: string } {
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
    roomId?: string,
    roomLabel?: string,
    actingRoomId?: string,
  ): { fromStatus: string; toStatus: string } {
    return this.withTransaction('checkInRoom', () => {
      requireVisitExistsInDb(this.db, visitId);
      const updatedAt = this.commonHelperDeps().nowIso();
      const transition = arriveVisit(
        this.db,
        getFlowCoreRuntime(this.db),
        visitId,
        actingRoomId,
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
  ): { fromStatus: string; toStatus: string } {
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

  checkOutRoom(visitId: string, actingRoomId?: string): { fromStatus: string; toStatus: string } {
    return this.withTransaction('checkOutRoom', () => {
      requireVisitExistsInDb(this.db, visitId);
      const updatedAt = this.commonHelperDeps().nowIso();
      const transition = completeVisit(getFlowCoreRuntime(this.db), visitId, actingRoomId);
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

  returnToWaiting(visitId: string): { fromStatus: string; toStatus: string } {
    cancelRecallWindowExpiry(visitId);
    return this.withTransaction('returnToWaiting', () => {
      requireVisitExistsInDb(this.db, visitId);
      const updatedAt = this.commonHelperDeps().nowIso();
      const runtime = getFlowCoreRuntime(this.db);
      const absentTransition = returnAbsentVisitToQueue(this.db, runtime, visitId, updatedAt);
      const transition = absentTransition ?? returnVisitToWaiting(runtime, visitId);
      if (!absentTransition) {
        clearAbsentMode(this.db, visitId, updatedAt);
      }
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

  setAbsence(visitId: string, mode: AbsenceMode): { fromStatus: string; toStatus: string } {
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

  setIdentityRef(
    visitId: string,
    identityRef: string,
  ): { identityRef: string; updatedAt: string } {
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

  cycleTriage(visitId: string): { triageLevel: string | null; updatedAt: string } {
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
  ): Promise<{ visitId: string; fromStatus: string; toStatus: string }> {
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
    fromStatus: string;
    toStatus: string;
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
    return resolveRoutingCapabilities(this.getOpsSettings());
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
            details: { activeJourneyVisitCount: modeGuard.activeJourneyVisitCount },
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
    return this.withTransaction('resetBusinessDay', () => {
      const result = resetBusinessDayInDb(this.dayLifecycleDeps());
      clearAllTerminalAssistPendingExpiries();
      clearAllTerminalAssistPending(this.db);
      clearFlowCoreVisitRuntime(this.db);
      resetFlowCoreRuntimeForTests();
      return result;
    });
  }

  getRuntimeResetPreview(): RuntimeResetPreview {
    return getRuntimeResetPreviewFromDb(this.runtimeResetDeps(), RUNTIME_RESET_CONFIRM_PHRASE);
  }

  executeRuntimeReset(): RuntimeResetResult {
    return this.withTransaction('executeRuntimeReset', () => {
      const result = executeRuntimeResetInDb(this.runtimeResetDeps());
      clearAllTerminalAssistPendingExpiries();
      clearAllTerminalAssistPending(this.db);
      clearFlowCoreVisitRuntime(this.db);
      resetFlowCoreRuntimeForTests();
      return result;
    });
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
