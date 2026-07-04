import type { CoreDatabase } from '../db/database.js';
import { currentOpsRevision, publishOpsEvent, type EmergencyOpsPayload } from './ops-event-hub.js';

export function buildEmergencySnapshot(db: CoreDatabase): EmergencyOpsPayload {
  const state = db.getEmergencyState();
  return {
    revision: currentOpsRevision('emergency'),
    active: state.active,
    emergencyId: state.emergencyId,
    raisedAt: state.raisedAt,
    acknowledgedAt: state.acknowledgedAt,
    serverTime: new Date().toISOString(),
  };
}

export function notifyEmergencyChanged(db: CoreDatabase): EmergencyOpsPayload {
  const state = db.getEmergencyState();
  return publishOpsEvent('emergency', {
    active: state.active,
    emergencyId: state.emergencyId,
    raisedAt: state.raisedAt,
    acknowledgedAt: state.acknowledgedAt,
  });
}
