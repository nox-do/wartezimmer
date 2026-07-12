import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const COMPOSE_FILES = ['docker-compose.yml', 'docker-compose.delivery.yml'] as const;

function readCompose(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

for (const composeFile of COMPOSE_FILES) {
  test(`${composeFile} keeps maintenance off LAN via host-loopback publish`, () => {
    const source = readCompose(composeFile);
    assert.match(source, /MAINTENANCE_HOST:\s*0\.0\.0\.0/);
    assert.match(source, /MAINTENANCE_PORT:\s*8082/);
    assert.match(source, /127\.0\.0\.1:8082:8082/);
    assert.doesNotMatch(source, /^\s+-\s+'8082:8082'/m);
  });
}

test('packaged manager copies delivery compose with maintenance port config', () => {
  const delivery = readCompose('docker-compose.delivery.yml');
  assert.match(delivery, /MAINTENANCE_HOST:\s*0\.0\.0\.0/);
  assert.match(delivery, /127\.0\.0\.1:8082:8082/);
});
