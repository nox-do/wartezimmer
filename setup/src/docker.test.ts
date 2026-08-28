import assert from 'node:assert/strict';
import test from 'node:test';
import { buildComposeStatus, parseComposePsOutput, resolveComposeFiles } from './docker.js';

test('resolveComposeFiles selects base file by delivery flag', () => {
  assert.deepEqual(
    resolveComposeFiles({
      projectRoot: '/tmp/pf',
      delivery: false,
      proxyEnabled: false,
      gatewayEnabled: false,
    }),
    ['docker-compose.yml'],
  );
  assert.deepEqual(
    resolveComposeFiles({
      projectRoot: '/tmp/pf',
      delivery: true,
      proxyEnabled: false,
      gatewayEnabled: false,
    }),
    ['docker-compose.delivery.yml'],
  );
});

test('resolveComposeFiles stacks proxy overlays', () => {
  assert.deepEqual(
    resolveComposeFiles({
      projectRoot: '/tmp/pf',
      delivery: false,
      proxyEnabled: true,
      gatewayEnabled: false,
    }),
    ['docker-compose.yml', 'docker-compose.proxy.yml'],
  );
  assert.deepEqual(
    resolveComposeFiles({
      projectRoot: '/tmp/pf',
      delivery: true,
      proxyEnabled: true,
      gatewayEnabled: false,
    }),
    ['docker-compose.delivery.yml', 'docker-compose.proxy.delivery.yml'],
  );
});

test('resolveComposeFiles adds TLS overlay only when explicitly selected', () => {
  assert.deepEqual(
    resolveComposeFiles({
      projectRoot: '/tmp/praxis-flow-dev',
      delivery: false,
      proxyEnabled: true,
      proxyTlsEnabled: true,
    }),
    ['docker-compose.yml', 'docker-compose.proxy.yml', 'docker-compose.proxy-tls.yml'],
  );
  assert.deepEqual(
    resolveComposeFiles({
      projectRoot: '/tmp/praxis-flow-delivery',
      delivery: true,
      proxyEnabled: true,
      proxyTlsEnabled: true,
    }),
    [
      'docker-compose.delivery.yml',
      'docker-compose.proxy.delivery.yml',
      'docker-compose.proxy-tls.delivery.yml',
    ],
  );
});

test('parseComposePsOutput handles empty stdout', () => {
  assert.deepEqual(parseComposePsOutput(''), []);
  assert.deepEqual(parseComposePsOutput('   \n'), []);
});

test('parseComposePsOutput parses line-delimited json rows', () => {
  const stdout = [
    '{"Name":"pf-dev-001-app-1","Service":"app","State":"running","Health":"healthy","Publishers":[{"URL":"0.0.0.0","TargetPort":8080,"PublishedPort":8080,"Protocol":"tcp"}]}',
    '{"Name":"pf-dev-001-sandbox-1","Service":"sandbox","State":"exited","Health":"","Publishers":null}',
  ].join('\n');

  assert.deepEqual(parseComposePsOutput(stdout), [
    {
      name: 'pf-dev-001-app-1',
      service: 'app',
      state: 'running',
      health: 'healthy',
      publishedPorts: [8080],
    },
    {
      name: 'pf-dev-001-sandbox-1',
      service: 'sandbox',
      state: 'exited',
      health: null,
      publishedPorts: [],
    },
  ]);
});

test('parseComposePsOutput parses json array payload', () => {
  const stdout = JSON.stringify([
    { name: 'app-1', service: 'app', state: 'running' },
    { name: 'sandbox-1', service: 'sandbox', state: 'running', health: 'starting' },
  ]);

  assert.deepEqual(parseComposePsOutput(stdout), [
    { name: 'app-1', service: 'app', state: 'running', health: null, publishedPorts: [] },
    {
      name: 'sandbox-1',
      service: 'sandbox',
      state: 'running',
      health: 'starting',
      publishedPorts: [],
    },
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
