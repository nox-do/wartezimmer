import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const productComposeFiles = [
  'docker-compose.yml',
  'docker-compose.delivery.yml',
  'docker-compose.proxy.yml',
  'docker-compose.proxy.delivery.yml',
];

test('product services use Compose project ownership instead of global container names', () => {
  for (const relativePath of productComposeFiles) {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
    assert.doesNotMatch(source, /^\s*container_name:/m, relativePath);
  }
});
