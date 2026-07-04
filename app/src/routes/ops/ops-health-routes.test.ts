import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { opsSchemas } from '../../api/generated/ops.fastify-schemas.js';
import type { CoreDatabase } from '../../shared/db/database.js';
import { registerOpsHealthRoutes } from './ops-health-routes.js';

function fakeOpsDb(overrides?: {
  terminalWlanPromoEnabled?: boolean;
  terminalAuthPhoneEnabled?: boolean;
  terminalAuthNameDobEnabled?: boolean;
  terminalAuthEgkEnabled?: boolean;
  emergencyEnabled?: boolean;
  emergencyActive?: boolean;
}): CoreDatabase {
  return {
    getOpsState: () => ({ checkinLocked: false, dayClosePhase: 'open' as const }),
    getOpsSettings: () => ({
      terminalWlanPromoEnabled: overrides?.terminalWlanPromoEnabled ?? true,
      terminalAuthPhoneEnabled: overrides?.terminalAuthPhoneEnabled ?? true,
      terminalAuthNameDobEnabled: overrides?.terminalAuthNameDobEnabled ?? false,
      terminalAuthEgkEnabled: overrides?.terminalAuthEgkEnabled ?? false,
      emergencyEnabled: overrides?.emergencyEnabled ?? true,
      terminalPatientLocales: ['de-DE'],
    }),
    getEmergencyState: () => ({
      active: overrides?.emergencyActive ?? false,
      emergencyId: null,
      raisedAt: null,
      acknowledgedAt: null,
    }),
    isEffectiveCheckinLocked: () => false,
  } as unknown as CoreDatabase;
}

test('GET /api/v1/ops/heartbeat serializes terminal auth and emergency flags', async () => {
  const app = Fastify({ logger: false });
  registerOpsHealthRoutes(
    app,
    fakeOpsDb({
      terminalWlanPromoEnabled: true,
      terminalAuthPhoneEnabled: true,
      terminalAuthNameDobEnabled: true,
      terminalAuthEgkEnabled: false,
      emergencyActive: true,
    }),
  );

  await app.ready();
  const response = await app.inject({ method: 'GET', url: '/api/v1/ops/heartbeat' });
  assert.equal(response.statusCode, 200);

  const body = response.json() as {
    terminalWlanPromoEnabled?: boolean;
    terminalAuthPhoneEnabled?: boolean;
    terminalAuthNameDobEnabled?: boolean;
    terminalAuthEgkEnabled?: boolean;
    emergencyEnabled?: boolean;
    emergencyActive?: boolean;
  };
  assert.equal(body.terminalWlanPromoEnabled, true);
  assert.equal(body.terminalAuthPhoneEnabled, true);
  assert.equal(body.terminalAuthNameDobEnabled, true);
  assert.equal(body.terminalAuthEgkEnabled, false);
  assert.equal(body.emergencyEnabled, true);
  assert.equal(body.emergencyActive, true);
  await app.close();
});

test('GET /api/v1/ops/heartbeat response matches OpenAPI schema', async () => {
  const app = Fastify({ logger: false });
  registerOpsHealthRoutes(app, fakeOpsDb());

  await app.ready();
  const response = await app.inject({ method: 'GET', url: '/api/v1/ops/heartbeat' });
  assert.equal(response.statusCode, 200);
  assert.equal(
    opsSchemas.GET_api_v1_ops_heartbeatResponse200.required.includes('terminalAuthPhoneEnabled'),
    true,
  );
  await app.close();
});
