import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildComposeStatus,
  COMPOSE_TLS_LAB_SERVICES,
  isWildcardPublishedHostIp,
  normalizePublishedHostIp,
  parseDockerInspectPublishedBindings,
  parseComposePsOutput,
  productComposeServices,
  resolveComposeFiles,
  withInspectedPublishedBindings,
} from './docker.js';

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

test('resolveComposeFiles stacks pebble lab overlays only for non-delivery TLS', () => {
  assert.deepEqual(
    resolveComposeFiles({
      projectRoot: '/tmp/praxis-flow-dev',
      delivery: false,
      proxyEnabled: true,
      proxyTlsEnabled: true,
      tlsLabEnabled: true,
    }),
    [
      'docker-compose.yml',
      'docker-compose.proxy.yml',
      'docker-compose.proxy-tls.yml',
      'docker-compose.tls-lab.yml',
      'docker-compose.tls-lab-proxy.yml',
    ],
  );
  assert.deepEqual(
    resolveComposeFiles({
      projectRoot: '/tmp/praxis-flow-delivery',
      delivery: true,
      proxyEnabled: true,
      proxyTlsEnabled: true,
      tlsLabEnabled: true,
    }),
    [
      'docker-compose.delivery.yml',
      'docker-compose.proxy.delivery.yml',
      'docker-compose.proxy-tls.delivery.yml',
    ],
  );
});

test('productComposeServices never includes TLS lab or removed gateway', () => {
  assert.deepEqual(productComposeServices({}), ['app', 'sandbox']);
  assert.deepEqual(productComposeServices({ proxyEnabled: true }), ['app', 'sandbox', 'proxy']);
  assert.deepEqual(productComposeServices({ proxyEnabled: true, gatewayEnabled: true }), [
    'app',
    'sandbox',
    'proxy',
  ]);
  assert.equal(
    COMPOSE_TLS_LAB_SERVICES.some((name) =>
      productComposeServices({ proxyEnabled: true, gatewayEnabled: true }).includes(name),
    ),
    false,
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
      publishedBindings: [
        { hostIp: '0.0.0.0', publishedPort: 8080, targetPort: 8080, protocol: 'tcp' },
      ],
    },
    {
      name: 'pf-dev-001-sandbox-1',
      service: 'sandbox',
      state: 'exited',
      health: null,
      publishedPorts: [],
      publishedBindings: [],
    },
  ]);
});

test('parseComposePsOutput parses json array payload', () => {
  const stdout = JSON.stringify([
    { name: 'app-1', service: 'app', state: 'running' },
    { name: 'sandbox-1', service: 'sandbox', state: 'running', health: 'starting' },
  ]);

  assert.deepEqual(parseComposePsOutput(stdout), [
    {
      name: 'app-1',
      service: 'app',
      state: 'running',
      health: null,
      publishedPorts: [],
      publishedBindings: undefined,
    },
    {
      name: 'sandbox-1',
      service: 'sandbox',
      state: 'running',
      health: 'starting',
      publishedPorts: [],
      publishedBindings: undefined,
    },
  ]);
});

test('parseComposePsOutput keeps compatibility ports but marks incomplete bindings unknown', () => {
  const stdout = JSON.stringify({
    name: 'proxy-1',
    service: 'proxy',
    state: 'running',
    publishers: [{ publishedPort: 443 }],
  });

  assert.deepEqual(parseComposePsOutput(stdout), [
    {
      name: 'proxy-1',
      service: 'proxy',
      state: 'running',
      health: null,
      publishedPorts: [443],
      publishedBindings: undefined,
    },
  ]);
});

test('published host IP normalization recognizes IPv4, IPv6 and empty wildcards', () => {
  assert.equal(normalizePublishedHostIp(' 192.168.1.20 '), '192.168.1.20');
  assert.equal(normalizePublishedHostIp('[::]'), '::');
  assert.equal(normalizePublishedHostIp(''), '0.0.0.0');
  assert.equal(normalizePublishedHostIp(undefined), null);
  assert.equal(isWildcardPublishedHostIp('0.0.0.0'), true);
  assert.equal(isWildcardPublishedHostIp('[::]'), true);
  assert.equal(isWildcardPublishedHostIp('127.0.0.1'), false);
});

test('parseDockerInspectPublishedBindings reads concrete and wildcard bindings', () => {
  const stdout = JSON.stringify({
    '443/tcp': [
      { HostIp: '192.168.1.20', HostPort: '443' },
      { HostIp: '::', HostPort: '443' },
    ],
    '8080/tcp': null,
  });

  assert.deepEqual(parseDockerInspectPublishedBindings(stdout), [
    { hostIp: '192.168.1.20', publishedPort: 443, targetPort: 443, protocol: 'tcp' },
    { hostIp: '::', publishedPort: 443, targetPort: 443, protocol: 'tcp' },
  ]);
  assert.equal(parseDockerInspectPublishedBindings('not-json'), undefined);
});

test('withInspectedPublishedBindings enriches incomplete compose status', () => {
  const service = {
    name: 'proxy-1',
    service: 'proxy',
    state: 'running',
    health: 'healthy',
    publishedPorts: [443],
  };
  const enriched = withInspectedPublishedBindings(
    service,
    JSON.stringify({ '443/tcp': [{ HostIp: '192.168.1.20', HostPort: '443' }] }),
  );

  assert.deepEqual(enriched, {
    ...service,
    publishedPorts: [443],
    publishedBindings: [
      { hostIp: '192.168.1.20', publishedPort: 443, targetPort: 443, protocol: 'tcp' },
    ],
  });
});

test('buildComposeStatus marks running when any service is running', () => {
  const services = [
    { name: 'a', service: 'app', state: 'exited', health: null },
    { name: 'b', service: 'sandbox', state: 'running', health: null },
  ];
  assert.equal(buildComposeStatus(services).running, true);
  assert.equal(buildComposeStatus([services[0]]).running, false);
});
