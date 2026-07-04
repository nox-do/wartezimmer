import assert from 'node:assert/strict';
import test from 'node:test';
import { buildComposeStatus, parseComposePsOutput } from './docker.js';

test('parseComposePsOutput handles empty stdout', () => {
  assert.deepEqual(parseComposePsOutput(''), []);
  assert.deepEqual(parseComposePsOutput('   \n'), []);
});

test('parseComposePsOutput parses line-delimited json rows', () => {
  const stdout = [
    '{"Name":"pf-dev-001-app-1","Service":"app","State":"running","Health":"healthy"}',
    '{"Name":"pf-dev-001-sandbox-1","Service":"sandbox","State":"exited","Health":""}',
  ].join('\n');

  assert.deepEqual(parseComposePsOutput(stdout), [
    {
      name: 'pf-dev-001-app-1',
      service: 'app',
      state: 'running',
      health: 'healthy',
    },
    {
      name: 'pf-dev-001-sandbox-1',
      service: 'sandbox',
      state: 'exited',
      health: null,
    },
  ]);
});

test('parseComposePsOutput parses json array payload', () => {
  const stdout = JSON.stringify([
    { name: 'app-1', service: 'app', state: 'running' },
    { name: 'sandbox-1', service: 'sandbox', state: 'running', health: 'starting' },
  ]);

  assert.deepEqual(parseComposePsOutput(stdout), [
    { name: 'app-1', service: 'app', state: 'running', health: null },
    { name: 'sandbox-1', service: 'sandbox', state: 'running', health: 'starting' },
  ]);
});

test('buildComposeStatus marks running when any service is running', () => {
  const services = [
    { name: 'a', service: 'app', state: 'exited', health: null },
    { name: 'b', service: 'sandbox', state: 'running', health: null },
  ];
  assert.equal(buildComposeStatus(services).running, true);
  assert.equal(buildComposeStatus([services[0]]).running, false);
});
