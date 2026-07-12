import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  escapeEnvValueForCompose,
  findLatestEnvBackupPath,
  readEnvMap,
  unescapeEnvValueFromCompose,
  writeEnvFromExample,
} from './env-file.js';

test('findLatestEnvBackupPath returns newest backup by timestamp suffix', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-env-backup-'));
  try {
    fs.writeFileSync(path.join(dir, '.env'), 'KEY=value\n');
    fs.writeFileSync(path.join(dir, '.env.backup-2026-06-24T10-00-00-000Z'), 'old\n');
    fs.writeFileSync(path.join(dir, '.env.backup-2026-06-25T10-00-00-000Z'), 'new\n');

    assert.equal(
      findLatestEnvBackupPath(dir),
      path.join(dir, '.env.backup-2026-06-25T10-00-00-000Z'),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('findLatestEnvBackupPath returns null when no backups exist', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-env-backup-'));
  try {
    fs.writeFileSync(path.join(dir, '.env'), 'KEY=value\n');
    assert.equal(findLatestEnvBackupPath(dir), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('escapeEnvValueForCompose doubles dollar signs for docker compose', () => {
  const hash =
    'pbkdf2-sha256$100000$cHJheGlzLWZsb3ctc3RhZmYtZGV2LXBpbi1zZWVkLXYx$HT9LqSxynL17qcNaYzJHZ0d51Cqtk1bxUb12izpJdls';
  const escaped = escapeEnvValueForCompose(hash);
  assert.match(escaped, /\$\$100000\$\$/);
  assert.equal(unescapeEnvValueFromCompose(escaped), hash);
});

test('readEnvMap unescapes docker compose env values', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-env-read-'));
  try {
    const envPath = path.join(dir, '.env');
    fs.writeFileSync(envPath, 'AUTH_KEY_CAPTIVE=test-key\nSANDBOX_INTERNAL_TOKEN=test-token\n');
    const map = readEnvMap(envPath);
    assert.equal(map.get('AUTH_KEY_CAPTIVE'), 'test-key');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('writeEnvFromExample preserves keys that are only commented in the template', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-env-preserve-commented-'));
  try {
    fs.writeFileSync(
      path.join(dir, '.env.example'),
      [
        'PRACTICE_DISPLAY_NAME=Praxis',
        '# PRAXIS_FLOW_APP_IMAGE=ghcr.io/your-org/praxis-flow-app:v0.1.0',
        '# PRAXIS_FLOW_SANDBOX_IMAGE=ghcr.io/your-org/praxis-flow-sandbox:v0.1.0',
        '',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(dir, '.env'),
      [
        'PRACTICE_DISPLAY_NAME=Alt',
        'PRAXIS_FLOW_APP_IMAGE=praxis-flow/app:local',
        'PRAXIS_FLOW_SANDBOX_IMAGE=praxis-flow/sandbox:local',
        '',
      ].join('\n'),
    );

    writeEnvFromExample(
      dir,
      {
        practiceDisplayName: 'Neu',
        secrets: {
          AUTH_KEY_CAPTIVE: 'captive',
          SANDBOX_INTERNAL_TOKEN: 'sandbox',
          OPENNDS_FAS_KEY: 'fas',
        },
        extra: {},
      },
      {
        preserveExistingKeys: ['PRAXIS_FLOW_APP_IMAGE', 'PRAXIS_FLOW_SANDBOX_IMAGE'],
      },
    );

    const envMap = readEnvMap(path.join(dir, '.env'));
    assert.equal(envMap.get('PRACTICE_DISPLAY_NAME'), 'Neu');
    assert.equal(envMap.get('PRAXIS_FLOW_APP_IMAGE'), 'praxis-flow/app:local');
    assert.equal(envMap.get('PRAXIS_FLOW_SANDBOX_IMAGE'), 'praxis-flow/sandbox:local');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
