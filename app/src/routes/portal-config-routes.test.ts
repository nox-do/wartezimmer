import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import type { CoreDatabase } from '../shared/db/database.js';
import { registerPortalConfigRoutes } from './portal-config-routes.js';

test('portal config keeps patient-facing bootstrap data inside the portal namespace', async () => {
  const app = Fastify();
  registerPortalConfigRoutes(app, {
    getOpsSettings: () => ({
      terminalPatientLocales: ['de-DE', 'en-GB'],
      practiceProfileJson: JSON.stringify({ displayName: 'Praxis Beispiel' }),
    }),
    isPortalEnabled: () => true,
  } as unknown as CoreDatabase);

  const response = await app.inject({ method: 'GET', url: '/api/v1/portal/config' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    terminalPatientLocales: ['de-DE', 'en-GB'],
    portalEnabled: true,
    practiceProfile: {
      displayName: 'Praxis Beispiel',
      street: '',
      postalCode: '',
      city: '',
      phone: '',
      email: '',
      dataProtectionOfficer: '',
      website: '',
    },
  });
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/portal-config' })).statusCode, 404);
  await app.close();
});
