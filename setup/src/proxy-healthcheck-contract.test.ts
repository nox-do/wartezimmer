import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(import.meta.dirname, '../..');

for (const fileName of ['docker-compose.proxy.yml', 'docker-compose.proxy.delivery.yml']) {
  test(`${fileName} keeps host-port mappings separate from internal health ports`, () => {
    const compose = fs.readFileSync(path.join(projectRoot, fileName), 'utf8');

    assert.match(compose, /'\$\{PROXY_HTTP_PORT:-80\}:80'/);
    assert.match(compose, /PROXY_MODE:-http.*tls-managed/s);
    assert.match(compose, /PROXY_MODE:-http.*tls-custom/s);
    assert.match(compose, /http:\/\/127\.0\.0\.1:80\//);
    assert.match(compose, /https:\/\/127\.0\.0\.1:443\/__praxis-flow\/health/);
    assert.doesNotMatch(compose, /127\.0\.0\.1:\$\{PROXY_(?:HTTP|HTTPS)_PORT/);
  });
}

for (const fileName of ['docker-compose.proxy-tls.yml', 'docker-compose.proxy-tls.delivery.yml']) {
  test(`${fileName} maps the configurable HTTPS host port to container port 443`, () => {
    const compose = fs.readFileSync(path.join(projectRoot, fileName), 'utf8');
    assert.match(compose, /'\$\{PROXY_HTTPS_PORT:-443\}:443'/);
  });
}
