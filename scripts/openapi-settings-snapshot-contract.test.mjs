import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createResponseValidator, loadOpenApiBundle } from './openapi-contract-lib.mjs';
import { resolveSchemaRefs, toFastifyJsonSchema } from './openapi-lib.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('SettingsSnapshotV1 accepts the runtime snapshot shape with optional env', () => {
  const bundle = loadOpenApiBundle(repoRoot);
  const components = bundle.components.schemas;
  const schema = toFastifyJsonSchema(resolveSchemaRefs(components.SettingsSnapshotV1, components));
  const validate = createResponseValidator(schema);
  const dbSnapshot = {
    settingsFormatVersion: 1,
    exportedAt: '2026-07-12T12:00:00.000Z',
    opsSettings: { routingMode: 'simple' },
    authSettings: {
      staffPinHashMfa: 'a',
      staffPinHashOps: 'b',
      roomPanelPinHash: 'c',
    },
    messagingProviderConfigs: [],
  };

  assert.equal(validate(dbSnapshot), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...dbSnapshot, env: { BUSINESS_TZ: 'Europe/Berlin' } }), true);
  assert.equal(validate({ ...dbSnapshot, unexpected: true }), false);
});
