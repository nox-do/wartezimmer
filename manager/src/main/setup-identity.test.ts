import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { SETUP_API_PROTOCOL_VERSION } from '@praxis-flow/server-shared/setup-api';
import {
  createLineAssembler,
  evaluateSetupHealthIdentity,
  isAttachExistingSetupEnabled,
  parseSetupReadyLine,
} from './setup-identity.js';

test('parseSetupReadyLine reads the dedicated ready marker even with npm noise', () => {
  assert.equal(parseSetupReadyLine('npm warn something'), null);
  assert.equal(
    parseSetupReadyLine('PRAXIS_FLOW_SETUP_READY {"port":43121}'),
    43121,
  );
  assert.equal(
    parseSetupReadyLine('> setup@0.4.0 serve\nPRAXIS_FLOW_SETUP_READY {"port":9190}'),
    9190,
  );
  assert.equal(parseSetupReadyLine('PRAXIS_FLOW_SETUP_READY {"port":0}'), null);
});

test('createLineAssembler parses a ready marker split across chunks', () => {
  const lines = createLineAssembler();
  assert.deepEqual(lines.push('PRAXIS_FLOW_SETUP_READY {"por'), []);
  assert.deepEqual(lines.push('t":43121}\n[setup] more\n'), [
    'PRAXIS_FLOW_SETUP_READY {"port":43121}',
    '[setup] more',
  ]);
  assert.equal(parseSetupReadyLine('PRAXIS_FLOW_SETUP_READY {"port":43121}'), 43121);
});

test('isAttachExistingSetupEnabled is opt-in only', () => {
  assert.equal(isAttachExistingSetupEnabled({}), false);
  assert.equal(isAttachExistingSetupEnabled({ PRAXIS_FLOW_SETUP_ATTACH: '1' }), true);
  assert.equal(isAttachExistingSetupEnabled({ PRAXIS_FLOW_SETUP_ATTACH: 'true' }), true);
  assert.equal(isAttachExistingSetupEnabled({ PRAXIS_FLOW_SETUP_ATTACH: 'yes' }), true);
  assert.equal(isAttachExistingSetupEnabled({ PRAXIS_FLOW_SETUP_ATTACH: '0' }), false);
});

test('evaluateSetupHealthIdentity rejects leftover { ok: true } health', () => {
  const expected = {
    protocolVersion: SETUP_API_PROTOCOL_VERSION,
    buildId: '0.4.0',
    installHome: '/tmp/pf-dev-001',
  };
  assert.match(
    evaluateSetupHealthIdentity({ ok: true }, expected) ?? '',
    /protocolVersion/,
  );
  assert.equal(
    evaluateSetupHealthIdentity(
      {
        ok: true,
        protocolVersion: SETUP_API_PROTOCOL_VERSION,
        buildId: '0.4.0',
        installHome: '/tmp/pf-dev-001',
        composeProjectName: 'pf-pf-dev-001',
      },
      expected,
    ),
    null,
  );
  assert.match(
    evaluateSetupHealthIdentity(
      {
        ok: true,
        protocolVersion: SETUP_API_PROTOCOL_VERSION,
        buildId: '0.4.0',
        installHome: '/tmp/other',
        composeProjectName: 'x',
      },
      expected,
    ) ?? '',
    /Install-Home/,
  );
  assert.equal(
    evaluateSetupHealthIdentity(
      {
        ok: true,
        protocolVersion: SETUP_API_PROTOCOL_VERSION,
        buildId: '0.4.0',
        installHome: path.resolve('/tmp/pf-dev-001'),
        composeProjectName: 'x',
      },
      expected,
    ),
    null,
  );
});
