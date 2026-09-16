import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

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
    assert.match(compose, /https:\/\/127\.0\.0\.1:443\/__praxis-flow\/health/);
    assert.match(
      compose,
      /wget -qO- --no-check-certificate "https:\/\/127\.0\.0\.1:443\/__praxis-flow\/health" >\/dev\/null 2>&1 \|\| wget -qO- "http:\/\/127\.0\.0\.1:80\/"/,
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
