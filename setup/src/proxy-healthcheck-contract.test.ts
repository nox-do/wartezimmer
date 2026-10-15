import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';

const projectRoot = path.resolve(import.meta.dirname, '../..');

for (const fileName of ['docker-compose.yml', 'docker-compose.delivery.yml']) {
  test(`${fileName} keeps the proxy-free demo bind open and maintenance on loopback`, () => {
    const compose = fs.readFileSync(path.join(projectRoot, fileName), 'utf8');

    assert.match(compose, /'\$\{APP_BIND_ADDRESS:-0\.0\.0\.0\}:8080:8080'/);
    assert.match(compose, /'127\.0\.0\.1:8082:8082'/);
  });
}

for (const fileName of ['docker-compose.proxy.yml', 'docker-compose.proxy.delivery.yml']) {
  test(`${fileName} keeps host-port mappings separate from internal health ports`, () => {
    const compose = fs.readFileSync(path.join(projectRoot, fileName), 'utf8');

    assert.match(
      compose,
      /'\$\{SETUP_LAN_APP_IP:\?SETUP_LAN_APP_IP is required\}:\$\{PROXY_HTTP_PORT:-80\}:80'/,
    );
    assert.match(compose, /PROXY_MODE: \$\{PROXY_MODE:-http\}/);
    assert.match(compose, /http:\/\/127\.0\.0\.1:80\//);
    assert.match(compose, /https:\/\/127\.0\.0\.1:443\/__wartezimmer\/health/);
    assert.match(
      compose,
      /wget -qO- -T 2 --header='Connection: close' --no-check-certificate "https:\/\/127\.0\.0\.1:443\/__wartezimmer\/health" >\/dev\/null 2>&1 \|\| wget -qO- -T 2 --header='Connection: close' "http:\/\/127\.0\.0\.1:80\/"/,
    );
    assert.doesNotMatch(compose, /127\.0\.0\.1:\$\{PROXY_(?:HTTP|HTTPS)_PORT/);
    assert.match(
      compose,
      /app:\n(?:.|\n)*?ports: !override\n\s+- '127\.0\.0\.1:8080:8080'\n\s+- '127\.0\.0\.1:8082:8082'/,
    );
  });
}

for (const fileName of ['docker-compose.proxy-tls.yml', 'docker-compose.proxy-tls.delivery.yml']) {
  test(`${fileName} maps the configurable HTTPS host port to container port 443`, () => {
    const compose = fs.readFileSync(path.join(projectRoot, fileName), 'utf8');
    assert.match(
      compose,
      /'\$\{SETUP_LAN_APP_IP:\?SETUP_LAN_APP_IP is required\}:\$\{PROXY_HTTPS_PORT:-443\}:443'/,
    );
  });
}

for (const fileName of [
  'docker-compose.proxy-restricted.yml',
  'docker-compose.proxy-restricted.delivery.yml',
]) {
  test(`${fileName} maps external restricted HTTPS 443 to the isolated internal listener 444`, () => {
    const compose = fs.readFileSync(path.join(projectRoot, fileName), 'utf8');
    assert.match(
      compose,
      /'\$\{SETUP_RESTRICTED_APP_IP:\?SETUP_RESTRICTED_APP_IP is required\}:443:444'/,
    );
    assert.doesNotMatch(compose, /0\.0\.0\.0|\[::\]|:::/);
  });
}

test('source and delivery healthchecks agree and allow bounded cold starts', () => {
  for (const file of ['docker-compose.yml', 'docker-compose.delivery.yml']) {
    const compose = parse(fs.readFileSync(path.join(projectRoot, file), 'utf8'));
    for (const name of ['app', 'sandbox']) {
      const health = compose.services[name].healthcheck;
      assert.deepEqual(health.test.slice(0, 6), [
        'CMD',
        'wget',
        '-qO-',
        '-T',
        '4',
        '--header=Connection: close',
      ]);
      assert.equal(health.start_period, '60s');
      assert.equal(health.timeout, '6s');
      assert.equal(health.interval, '10s');
      assert.equal(health.retries, 5);
    }
    assert.equal(compose.services.app.depends_on.sandbox.condition, 'service_healthy');
  }
});
