import assert from 'node:assert/strict';
import test from 'node:test';
import { executeRuntimeResetInDb, type RuntimeResetDeps } from './database-runtime-reset.js';

function createRuntimeResetDeps(): RuntimeResetDeps & {
  row: { locked?: number; phase?: string; lastResetBusinessDay?: string };
  outboxDeleted: boolean;
  restoredProviderCalls: Array<{
    providerId: string;
    enabled: boolean;
    credentials: Record<string, string>;
  }>;
  emittedEvents: Array<{ type: string; payload: Record<string, unknown> }>;
  savedOpsSettings: Array<unknown>;
  emergencyClearedAt: string | null;
} {
  const row = {
    locked: 0,
    phase: 'started',
    lastResetBusinessDay: '2026-06-14',
  };
  let outboxDeleted = false;
  let emergencyClearedAt: string | null = null;
  const emittedEvents: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const restoredProviderCalls: Array<{
    providerId: string;
    enabled: boolean;
    credentials: Record<string, string>;
  }> = [];
  const savedOpsSettings: Array<unknown> = [];

  return {
    row,
    outboxDeleted,
    restoredProviderCalls,
    emittedEvents,
    savedOpsSettings,
    emergencyClearedAt,
    countAllVisitsStmt: { get: () => ({ count: 4 }) },
    countAllOutboxEventsStmt: { get: () => ({ count: 2 }) },
    deleteAllOutboxEventsStmt: {
      run: () => {
        outboxDeleted = true;
      },
    },
    clearEmergencyStateStmt: {
      run: (updatedAt: string) => {
        emergencyClearedAt = updatedAt;
      },
    },
    updateCheckinLockStmt: {
      run: (locked: number) => {
        row.locked = locked;
      },
    },
    updateDayClosePhaseStmt: {
      run: (phase: string) => {
        row.phase = phase;
      },
    },
    updateLastResetBusinessDayStmt: {
      run: (businessDay: string) => {
        row.lastResetBusinessDay = businessDay;
      },
    },
    getOpsSettingsStmt: {
      get: () => ({
        updatedAt: '2026-06-14T18:00:00.000Z',
        routingMode: 'complex',
        returnWindowMinutes: 30,
        exportBasePath: '/tmp/exports',
        practiceOpenFrom: '08:00',
        practiceOpenTo: '17:00',
        practiceProfileJson: '{"name":"Test"}',
        topicSettingsJson:
          '[{"topicId":"general","label":"General","laneCode":"G","defaultRoomId":"room-1","enabled":true,"sortOrder":1}]',
        roomsJson:
          '[{"roomId":"room-1","roomLabel":"Raum 1","enabled":true,"defaultCallTarget":true}]',
        contactLookupFolderPath: '/tmp/contacts',
        contactLookupDelimiterMode: 'auto',
        contactLookupHasHeader: 1,
        contactLookupMappingJson: '{"phone":"phone"}',
        emergencyEnabled: 1,
        terminalWlanPromoEnabled: 0,
        terminalAuthPhoneEnabled: 1,
        terminalAuthNameDobEnabled: 1,
        terminalAuthEgkEnabled: 0,
        terminalPatientLocales: '[]',
        smsProvider: 'mock',
      }),
    },
    updateOpsSettingsStmt: {
      run: (...args: unknown[]) => {
        savedOpsSettings.push(args);
      },
    },
    listMessagingProviderConfigsStmt: {
      all: () => [
        {
          providerId: 'mock',
          enabled: 1,
          credentialsJson: '{"apiKey":"secret"}',
        },
      ],
    },
    getMessagingProviderConfigByIdStmt: {
      get: () => ({
        enabled: 1,
        credentialsJson: '{"apiKey":"secret"}',
      }),
    },
    upsertMessagingProviderConfigStmt: {
      run: (providerId: string, _channel: string, enabled: number, credentialsJson: string) => {
        restoredProviderCalls.push({
          providerId,
          enabled: enabled === 1,
          credentials: JSON.parse(credentialsJson) as Record<string, string>,
        });
      },
    },
    emergencyStateStmt: {
      get: () => ({
        active: 1,
        emergencyId: 'emergency-1',
        raisedAt: '2026-06-15T05:30:00.000Z',
        acknowledgedAt: null,
      }),
    },
    nowIso: () => '2026-06-15T06:00:00.000Z',
    getBusinessDay: () => '2026-06-15',
    configuredExportBasePath: null,
    emitOutboxEvent: (type, _aggregateId, payload) => {
      emittedEvents.push({ type, payload });
    },
    get outboxDeleted() {
      return outboxDeleted;
    },
    set outboxDeleted(value: boolean) {
      outboxDeleted = value;
    },
    get emergencyClearedAt() {
      return emergencyClearedAt;
    },
    set emergencyClearedAt(value: string | null) {
      emergencyClearedAt = value;
    },
  } as unknown as RuntimeResetDeps & {
    row: { locked?: number; phase?: string; lastResetBusinessDay?: string };
    outboxDeleted: boolean;
    restoredProviderCalls: Array<{
      providerId: string;
      enabled: boolean;
      credentials: Record<string, string>;
    }>;
    emittedEvents: Array<{ type: string; payload: Record<string, unknown> }>;
    savedOpsSettings: Array<unknown>;
    emergencyClearedAt: string | null;
  };
}

test('executeRuntimeResetInDb reuses reset kernel and preserves ops configuration', () => {
  const deps = createRuntimeResetDeps();

  const result = executeRuntimeResetInDb(deps);

  assert.equal(deps.outboxDeleted, true);
  assert.equal(deps.emergencyClearedAt, '2026-06-15T06:00:00.000Z');
  assert.equal(result.resetVisitCount, 4);
  assert.equal(result.clearedOutboxCount, 2);
  assert.equal(result.emergencyCleared, true);
  assert.equal(result.checkinLocked, true);
  assert.equal(result.dayClosePhase, 'open');
  assert.equal(result.lastResetBusinessDay, '2026-06-15');
  assert.equal(deps.row.locked, 1);
  assert.equal(deps.row.phase, 'open');
  assert.equal(deps.row.lastResetBusinessDay, '2026-06-15');
  assert.equal(deps.savedOpsSettings.length, 1);
  assert.equal(deps.restoredProviderCalls.length, 1);
  assert.deepEqual(deps.restoredProviderCalls[0], {
    providerId: 'mock',
    enabled: true,
    credentials: { apiKey: 'secret' },
  });
  assert.equal(deps.emittedEvents.length, 1);
  assert.equal(deps.emittedEvents[0]?.type, 'OpsRuntimeReset');
  assert.equal(deps.emittedEvents[0]?.payload.clearedOutboxCount, 2);
});
