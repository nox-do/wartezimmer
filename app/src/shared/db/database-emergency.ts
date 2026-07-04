import { randomUUID } from 'node:crypto';
import type { StatementSync } from 'node:sqlite';
import type {
  EmergencyAcknowledgeResult,
  EmergencyRaiseResult,
  EmergencyState,
  OpsSettings,
} from './db-types.js';
import { domainError } from '../errors/domain-error.js';

type EmergencyStatements = {
  emergencyStateStmt: StatementSync;
  raiseEmergencyStmt: StatementSync;
  acknowledgeEmergencyStmt: StatementSync;
};

type EmergencyHelpers = {
  nowIso: () => string;
  getOpsSettings: () => OpsSettings;
  emitOutboxEvent: (
    eventType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
  ) => void;
};

export type EmergencyDeps = EmergencyStatements & EmergencyHelpers;

export function getEmergencyStateFromDb(
  deps: Pick<EmergencyDeps, 'emergencyStateStmt'>,
): EmergencyState {
  const row = deps.emergencyStateStmt.get() as
    | {
        active?: number;
        emergencyId?: string | null;
        raisedAt?: string | null;
        acknowledgedAt?: string | null;
      }
    | undefined;
  const emergencyId = row?.emergencyId ?? null;
  const raisedAt = row?.raisedAt ?? null;
  const acknowledgedAt = row?.acknowledgedAt ?? null;
  const active = row?.active === 1 && emergencyId != null && raisedAt != null;

  return {
    active,
    emergencyId,
    raisedAt,
    acknowledgedAt,
  };
}

export function raiseEmergencyInDb(
  deps: EmergencyDeps,
  source: 'terminal' | 'mfa',
): EmergencyRaiseResult {
  const settings = deps.getOpsSettings();
  if (!settings.emergencyEnabled) {
    throw domainError('EMERGENCY_DISABLED');
  }

  const state = deps.emergencyStateStmt.get() as
    | {
        locked?: number;
        active?: number;
        emergencyId?: string | null;
        raisedAt?: string | null;
      }
    | undefined;

  if (state?.locked === 1) {
    throw domainError('CHECKIN_LOCKED');
  }

  if (state?.active === 1 && state.emergencyId && state.raisedAt) {
    return {
      emergencyId: state.emergencyId,
      status: 'raised',
      raisedAt: state.raisedAt,
      alreadyActive: true,
    };
  }

  const emergencyId = randomUUID();
  const raisedAt = deps.nowIso();
  deps.raiseEmergencyStmt.run(emergencyId, raisedAt, raisedAt);
  deps.emitOutboxEvent('EmergencyRaised', emergencyId, {
    emergencyId,
    source,
    raisedAt,
  });
  return {
    emergencyId,
    status: 'raised',
    raisedAt,
    alreadyActive: false,
  };
}

export function acknowledgeEmergencyInDb(
  deps: EmergencyDeps,
  emergencyIdRaw: string,
): EmergencyAcknowledgeResult {
  const emergencyId = emergencyIdRaw.trim();
  if (!emergencyId) {
    throw domainError('EMERGENCY_NOT_FOUND');
  }

  const state = deps.emergencyStateStmt.get() as
    | {
        active?: number;
        emergencyId?: string | null;
        raisedAt?: string | null;
        acknowledgedAt?: string | null;
      }
    | undefined;

  if (!state?.emergencyId || state.emergencyId !== emergencyId || !state.raisedAt) {
    throw domainError('EMERGENCY_NOT_FOUND');
  }

  if (state.active === 1) {
    const acknowledgedAt = deps.nowIso();
    deps.acknowledgeEmergencyStmt.run(acknowledgedAt, acknowledgedAt);
    deps.emitOutboxEvent('EmergencyAcknowledged', emergencyId, {
      emergencyId,
      raisedAt: state.raisedAt,
      acknowledgedAt,
    });
    return {
      emergencyId,
      status: 'acknowledged',
      raisedAt: state.raisedAt,
      acknowledgedAt,
      uiDisplayed: true,
    };
  }

  if (state.acknowledgedAt) {
    return {
      emergencyId,
      status: 'acknowledged',
      raisedAt: state.raisedAt,
      acknowledgedAt: state.acknowledgedAt,
      uiDisplayed: true,
    };
  }

  throw domainError('EMERGENCY_NOT_FOUND');
}
