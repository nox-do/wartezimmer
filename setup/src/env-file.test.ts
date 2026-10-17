import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  escapeEnvValueForCompose,
  ensureEnvComposeEscaping,
  findLatestEnvBackupPath,
  readEnvMap,
  removeEnvKeys,
  unescapeEnvValueFromCompose,
  updateEnvKeys,
  writeEnvFromExample,
  writeEnvRecordAtomically,
} from './env-file.js';

test('plain env values keep spaces, Windows paths and dollar escaping without quotes', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-env-plain-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const file = path.join(home, '.env');
  fs.writeFileSync(file, '');
  const values = {
    PRACTICE_DISPLAY_NAME: 'Praxis Dr. Meier',
    IMPORTS_HOST_PATH: String.raw`C:\Users\Müller\Praxis Meier\imports`,
    AUTH_KEY_CAPTIVE: 'one$two$$three',
    TLS_CERT_NAMES: '["staff.example.test","*.portal.example.test"]',
  };
  updateEnvKeys(file, { ...values, PRACTICE_DISPLAY_NAME: '  Praxis Dr. Meier  ' });
  assert.deepEqual(Object.fromEntries(readEnvMap(file)), values);
  assert.match(
    fs.readFileSync(file, 'utf8'),
    /IMPORTS_HOST_PATH=C:\\Users\\Müller\\Praxis Meier\\imports\n/,
  );
  writeEnvRecordAtomically(file, values, { replace: true });
  assert.deepEqual(Object.fromEntries(readEnvMap(file)), values);
  assert.throws(
    () => updateEnvKeys(file, { TLS_CERT_NAMES: '["invalid #name"]' }),
    /ENV_INVALID_VALUE/,
  );
});

test('env mutations keep comments and literal dollars, normalize the end and preserve permissions', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-env-writes-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const file = path.join(home, '.env');
  fs.writeFileSync(
    path.join(home, '.env.example'),
    '# header\n\nKEY=old\nSECRET=keep$$literal\n\n\n',
  );
  const mutations = [
    () =>
      writeEnvFromExample(home, {
        practiceDisplayName: 'Praxis',
        secrets: {
          AUTH_KEY_CAPTIVE: 'a',
          MAINTENANCE_TOKEN: 'b',
          SANDBOX_INTERNAL_TOKEN: 'c',
          OPENNDS_FAS_KEY: 'd',
        },
        extra: { KEY: 'new' },
      }),
    () => updateEnvKeys(file, { KEY: 'updated' }),
    () => writeEnvRecordAtomically(file, { KEY: 'atomic' }),
    () => removeEnvKeys(file, ['KEY']),
    () => {
      fs.appendFileSync(file, 'ESCAPE=one$dollar\n\n\n');
      assert.equal(ensureEnvComposeEscaping(home), true);
    },
  ];
  for (const mutate of mutations) {
    const expectedMode = fs.existsSync(file) ? 0o640 : 0o666 & ~process.umask();
    if (fs.existsSync(file)) fs.chmodSync(file, expectedMode);
    mutate();
    const first = fs.readFileSync(file, 'utf8');
    if (mutate !== mutations[0] && mutate !== mutations[mutations.length - 1]) {
      mutate();
      assert.equal(fs.readFileSync(file, 'utf8'), first);
    }
    const content = fs.readFileSync(file, 'utf8');
    assert.match(content, /^# header\n\n/);
    assert.match(content, /[^\n]\n$/);
    assert.equal(readEnvMap(file).get('SECRET'), 'keep$literal');
    if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, expectedMode);
  }
  const before = fs.readFileSync(file, 'utf8');
  assert.equal(ensureEnvComposeEscaping(home), false);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.deepEqual(fs.readdirSync(home).sort(), ['.env', '.env.example']);
});

test('a failed env replacement preserves the original file and removes the temporary file', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-env-replace-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const file = path.join(home, '.env');
  const original = 'KEY=original\n';
  fs.writeFileSync(file, original);
  t.mock.method(fs, 'renameSync', () => {
    throw Object.assign(new Error('replacement denied'), { code: 'EACCES' });
  });
  assert.throws(() => updateEnvKeys(file, { KEY: 'updated' }), /replacement denied/);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  assert.deepEqual(fs.readdirSync(home), ['.env']);
});

test('invalid env inputs leave the file and backup set untouched without disclosing values', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-env-invalid-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const file = path.join(home, '.env');
  const original = 'KEY=original\n';
  fs.writeFileSync(file, original);
  fs.writeFileSync(path.join(home, '.env.example'), original);
  for (const value of [
    'secret\rinjected',
    'secret\ninjected',
    'secret\0injected',
    'secret"injected',
    "secret'injected",
    'secret#injected',
  ]) {
    const merge = {
      practiceDisplayName: 'Praxis',
      secrets: {
        AUTH_KEY_CAPTIVE: 'a',
        MAINTENANCE_TOKEN: 'b',
        SANDBOX_INTERNAL_TOKEN: 'c',
        OPENNDS_FAS_KEY: 'd',
      },
      extra: { KEY: value },
    };
    for (const mutate of [
      () => updateEnvKeys(file, { KEY: value }),
      () => writeEnvRecordAtomically(file, { KEY: value }),
      () => writeEnvFromExample(home, merge),
      () => writeEnvFromExample(home, { ...merge, extra: {}, practiceDisplayName: value }),
      () =>
        writeEnvFromExample(home, {
          ...merge,
          extra: {},
          secrets: { ...merge.secrets, MAINTENANCE_TOKEN: value },
        }),
    ]) {
      assert.throws(mutate, (error: Error) => {
        assert.match(error.message, /ENV_INVALID_VALUE/);
        assert.doesNotMatch(error.message, /secret|injected/);
        return true;
      });
      assert.equal(fs.readFileSync(file, 'utf8'), original);
      assert.deepEqual(fs.readdirSync(home).sort(), ['.env', '.env.example']);
    }
  }
  assert.throws(() => updateEnvKeys(file, { ['KEY\nINJECTED']: 'value' }), /ENV_INVALID_KEY/);
});

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
        '# WARTEZIMMER_APP_IMAGE=ghcr.io/your-org/wartezimmer-app:v0.1.0',
        '# WARTEZIMMER_SANDBOX_IMAGE=ghcr.io/your-org/wartezimmer-sandbox:v0.1.0',
        '',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(dir, '.env'),
      [
        'PRACTICE_DISPLAY_NAME=Alt',
        'WARTEZIMMER_APP_IMAGE=wartezimmer/app:local',
        'WARTEZIMMER_SANDBOX_IMAGE=wartezimmer/sandbox:local',
        '',
      ].join('\n'),
    );

    writeEnvFromExample(
      dir,
      {
        practiceDisplayName: 'Neu',
        secrets: {
          AUTH_KEY_CAPTIVE: 'captive',
          MAINTENANCE_TOKEN: 'maintenance',
          SANDBOX_INTERNAL_TOKEN: 'sandbox',
          OPENNDS_FAS_KEY: 'fas',
        },
        extra: {},
      },
      {
        preserveExistingKeys: ['WARTEZIMMER_APP_IMAGE', 'WARTEZIMMER_SANDBOX_IMAGE'],
      },
    );

    const envMap = readEnvMap(path.join(dir, '.env'));
    assert.equal(envMap.get('PRACTICE_DISPLAY_NAME'), 'Neu');
    assert.equal(envMap.get('WARTEZIMMER_APP_IMAGE'), 'wartezimmer/app:local');
    assert.equal(envMap.get('WARTEZIMMER_SANDBOX_IMAGE'), 'wartezimmer/sandbox:local');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('read-only escaping check finds unpaired dollars without exposing values', async () => {
  const { envKeysNeedingComposeEscaping } = await import('./env-file.js');
  assert.deepEqual(
    envKeysNeedingComposeEscaping(
      [
        '# comment $ignored',
        'PLAIN=unchanged',
        'ESCAPED=keep$$literal',
        'FOUR=keep$$$$literal',
        'SECRET=keep$literal',
        'ODD=keep$$$literal',
        'BRACED=${literal}',
        'TRAILING=keep$',
      ].join('\n'),
    ),
    ['SECRET', 'ODD', 'BRACED', 'TRAILING'],
  );
});

test('atomic TLS status update cannot be overridden by a duplicate stale env key', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-env-atomic-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const file = path.join(home, '.env');
  fs.writeFileSync(
    file,
    '# preserved\nTLS_STATE=error\nSECRET=keep$$literal\nTLS_STATE=degraded\n',
  );
  writeEnvRecordAtomically(file, { TLS_STATE: 'active' });
  assert.equal(readEnvMap(file).get('TLS_STATE'), 'active');
  assert.equal(readEnvMap(file).get('SECRET'), 'keep$literal');
  assert.match(fs.readFileSync(file, 'utf8'), /^# preserved/);
});
