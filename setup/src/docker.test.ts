import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ManagerApiError } from '@praxis-flow/server-shared/setup-api';
import {
  buildComposeStatus,
  runComposeCommand,
  COMPOSE_TLS_LAB_SERVICES,
  composeRestart,
  isWildcardPublishedHostIp,
  normalizePublishedHostIp,
  parseDockerInspectPublishedBindings,
  parseComposePsOutput,
  productComposeServices,
  resolveComposeFiles,
  validateStaffBindingEnv,
  withInspectedPublishedBindings,
} from './docker.js';

const interfaces = [
  {
    name: 'en7',
    addresses: [
      {
        family: 'IPv4' as const,
        address: '192.168.1.20',
        internal: false,
      },
    ],
  },
];

test('validateStaffBindingEnv allows the deliberate proxy-free demo binding', () => {
  assert.equal(
    validateStaffBindingEnv(
      new Map([
        ['PROXY_ENABLED', 'false'],
        ['APP_BIND_ADDRESS', '0.0.0.0'],
      ]),
      interfaces,
    ),
    null,
  );
  assert.equal(validateStaffBindingEnv(new Map(), interfaces), null);
});

test('validateStaffBindingEnv requires a local Staff-IP when proxy is enabled', () => {
  assert.match(
    validateStaffBindingEnv(
      new Map([
        ['PROXY_ENABLED', 'true'],
        ['APP_BIND_ADDRESS', '127.0.0.1'],
      ]),
      interfaces,
    ) || '',
    /SETUP_LAN_APP_IP fehlt/,
  );
  assert.match(
    validateStaffBindingEnv(
      new Map([
        ['SETUP_LAN_APP_IP', '192.168.1.99'],
        ['PROXY_ENABLED', 'true'],
        ['APP_BIND_ADDRESS', '127.0.0.1'],
      ]),
      interfaces,
    ) || '',
    /nicht vorhanden/,
  );
});

test('validateStaffBindingEnv requires loopback app bind when proxy is enabled', () => {
  assert.equal(
    validateStaffBindingEnv(
      new Map([
        ['SETUP_LAN_APP_IP', '192.168.1.20'],
        ['PROXY_ENABLED', 'true'],
        ['APP_BIND_ADDRESS', '127.0.0.1'],
      ]),
      interfaces,
    ),
    null,
  );
  assert.match(
    validateStaffBindingEnv(
      new Map([
        ['SETUP_LAN_APP_IP', '192.168.1.20'],
        ['PROXY_ENABLED', 'true'],
        ['APP_BIND_ADDRESS', '192.168.1.20'],
      ]),
      interfaces,
    ) || '',
    /erwartet 127\.0\.0\.1/,
  );
});

test('validateStaffBindingEnv fails closed for an active non-local restricted address', () => {
  const env = new Map([
    ['PROXY_ENABLED', 'true'],
    ['SETUP_LAN_APP_IP', '192.168.1.20'],
    ['APP_BIND_ADDRESS', '127.0.0.1'],
    ['SETUP_RESTRICTED_ENABLED', 'true'],
    ['SETUP_RESTRICTED_APP_IP', '10.20.0.99'],
  ]);
  assert.match(validateStaffBindingEnv(env, interfaces) || '', /Restricted-Bindung gesperrt/);
});

test('validateStaffBindingEnv requires the active restricted address on its persisted interface', () => {
  const twoInterfaces = [
    ...interfaces,
    {
      name: 'en0',
      addresses: [{ family: 'IPv4' as const, address: '192.168.1.10', internal: false }],
    },
  ];
  const env = new Map([
    ['PROXY_ENABLED', 'true'],
    ['SETUP_LAN_APP_IP', '192.168.1.20'],
    ['APP_BIND_ADDRESS', '127.0.0.1'],
    ['SETUP_RESTRICTED_ENABLED', 'true'],
    ['SETUP_RESTRICTED_APP_IP', '192.168.1.20'],
    ['SETUP_RESTRICTED_INTERFACE_ID', 'name:en7'],
  ]);
  assert.match(validateStaffBindingEnv(env, twoInterfaces) || '', /dürfen nicht identisch/);

  env.set('SETUP_RESTRICTED_APP_IP', '192.168.1.10');
  assert.match(validateStaffBindingEnv(env, twoInterfaces) || '', /gespeicherten Interface/);
  env.set('SETUP_RESTRICTED_INTERFACE_ID', 'name:en0');
  assert.equal(validateStaffBindingEnv(env, twoInterfaces), null);
});

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

test('resolveComposeFiles adds restricted publish only after the TLS proxy overlay', () => {
  assert.deepEqual(
    resolveComposeFiles({
      projectRoot: '/tmp/example',
      delivery: false,
      proxyEnabled: true,
      proxyTlsEnabled: true,
      restrictedEnabled: true,
    }),
    [
      'docker-compose.yml',
      'docker-compose.proxy.yml',
      'docker-compose.proxy-tls.yml',
      'docker-compose.proxy-restricted.yml',
    ],
  );
  assert.doesNotMatch(
    resolveComposeFiles({
      projectRoot: '/tmp/example',
      delivery: false,
      proxyEnabled: true,
      restrictedEnabled: true,
    }).join(' '),
    /proxy-restricted/,
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

test('parseComposePsOutput rejects output that cannot be observed reliably', () => {
  assert.throws(
    () => parseComposePsOutput('invalid-json'),
    (error) => error instanceof ManagerApiError && error.code === 'compose_status_unavailable',
  );
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

test('composeRestart recreates services and ignores shell binding overrides', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praxis-flow-compose-restart-'));
  const fakeDocker = path.join(root, 'docker');
  fs.writeFileSync(
    path.join(root, '.env'),
    [
      'PROXY_ENABLED=true',
      'PROXY_MODE=http',
      'SETUP_LAN_APP_IP=127.0.0.1',
      'APP_BIND_ADDRESS=127.0.0.1',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    fakeDocker,
    '#!/bin/sh\nprintf "%s\\n%s|%s" "$*" "${APP_BIND_ADDRESS-unset}" "${SETUP_LAN_APP_IP-unset}"\n',
    { mode: 0o755 },
  );
  const previousCli = process.env.PRAXIS_FLOW_DOCKER_CLI;
  const previousAppBind = process.env.APP_BIND_ADDRESS;
  const previousStaffIp = process.env.SETUP_LAN_APP_IP;
  process.env.PRAXIS_FLOW_DOCKER_CLI = fakeDocker;
  process.env.APP_BIND_ADDRESS = '0.0.0.0';
  process.env.SETUP_LAN_APP_IP = '0.0.0.0';
  try {
    const result = await composeRestart({
      projectRoot: root,
      composeProjectName: 'praxis-flow-test',
      delivery: false,
      withProxy: true,
      services: ['app', 'sandbox', 'proxy'],
    });
    assert.equal(result.ok, true);
    assert.match(result.log, /up -d --force-recreate app sandbox proxy/);
    assert.match(result.log, /unset\|unset/);
  } finally {
    if (previousCli === undefined) delete process.env.PRAXIS_FLOW_DOCKER_CLI;
    else process.env.PRAXIS_FLOW_DOCKER_CLI = previousCli;
    if (previousAppBind === undefined) delete process.env.APP_BIND_ADDRESS;
    else process.env.APP_BIND_ADDRESS = previousAppBind;
    if (previousStaffIp === undefined) delete process.env.SETUP_LAN_APP_IP;
    else process.env.SETUP_LAN_APP_IP = previousStaffIp;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rebuild compose preflight preserves env bytes and ignores parent image overrides', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-rebuild-command-'));
  const fakeDocker = path.join(root, 'docker');
  const envPath = path.join(root, '.env');
  const original = 'PROXY_ENABLED=false\nAUTH_KEY_CAPTIVE=keep$literal\n';
  fs.writeFileSync(envPath, original);
  fs.writeFileSync(path.join(root, 'docker-compose.yml'), 'services: {}');
  const override = path.join(root, 'pinned-images.json');
  fs.writeFileSync(override, '{}');
  fs.writeFileSync(
    fakeDocker,
    '#!/bin/sh\nprintf "%s\\n%s" "$*" "${PRAXIS_FLOW_APP_IMAGE-unset}"\n',
    { mode: 0o755 },
  );
  const previousCli = process.env.PRAXIS_FLOW_DOCKER_CLI;
  const previousImage = process.env.PRAXIS_FLOW_APP_IMAGE;
  process.env.PRAXIS_FLOW_DOCKER_CLI = fakeDocker;
  process.env.PRAXIS_FLOW_APP_IMAGE = 'unintended:latest';
  try {
    const result = await runComposeCommand(
      {
        projectRoot: root,
        composeProjectName: 'pf-test',
        delivery: false,
        preserveEnvFile: true,
        overrideFiles: [override],
      },
      ['config', '--format', 'json'],
    );
    assert.equal(result.ok, true);
    assert.equal(fs.readFileSync(envPath, 'utf8'), original);
    assert.ok(result.stdout.includes(`-f ${override}`));
    assert.match(result.stdout, /unset$/);
  } finally {
    if (previousCli === undefined) delete process.env.PRAXIS_FLOW_DOCKER_CLI;
    else process.env.PRAXIS_FLOW_DOCKER_CLI = previousCli;
    if (previousImage === undefined) delete process.env.PRAXIS_FLOW_APP_IMAGE;
    else process.env.PRAXIS_FLOW_APP_IMAGE = previousImage;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
