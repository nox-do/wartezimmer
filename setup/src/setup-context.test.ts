import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readEnvMap } from './env-file.js';
import {
  DELIVERY_BOOTSTRAP_FILES,
  ensureInstallHomeLayout,
  migrateMaintenanceToken,
  resolveSetupContext,
} from './setup-context.js';

test('delivery bootstrap contract contains every restricted proxy overlay', () => {
  assert.ok(DELIVERY_BOOTSTRAP_FILES.includes('docker-compose.proxy-restricted.delivery.yml'));
});

test('install bootstrap creates missing templates without overwriting installed versions', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-bootstrap-templates-'));
  const installHome = path.join(root, 'install');
  const templateRoot = path.join(root, 'templates');
  fs.mkdirSync(installHome, { recursive: true });
  fs.mkdirSync(templateRoot, { recursive: true });
  const previousProfile = process.env.WARTEZIMMER_COMPOSE_PROFILE;
  process.env.WARTEZIMMER_COMPOSE_PROFILE = 'dev';
  try {
    for (const relativePath of [
      '.env.example',
      'docker-compose.yml',
      'docker-compose.proxy.yml',
      'docker-compose.proxy-tls.yml',
      'docker-compose.proxy-restricted.yml',
      'proxy/Caddyfile',
    ]) {
      const source = path.join(templateRoot, relativePath);
      fs.mkdirSync(path.dirname(source), { recursive: true });
      fs.writeFileSync(source, `bundled:${relativePath}\n`);
    }
    fs.writeFileSync(path.join(installHome, 'docker-compose.yml'), 'installed:newer\n');

    const copied = ensureInstallHomeLayout(installHome, templateRoot);

    assert.equal(
      fs.readFileSync(path.join(installHome, 'docker-compose.yml'), 'utf8'),
      'installed:newer\n',
    );
    assert.equal(copied.includes('docker-compose.yml'), false);
    assert.equal(
      fs.readFileSync(path.join(installHome, 'docker-compose.proxy-restricted.yml'), 'utf8'),
      'bundled:docker-compose.proxy-restricted.yml\n',
    );
  } finally {
    if (previousProfile === undefined) delete process.env.WARTEZIMMER_COMPOSE_PROFILE;
    else process.env.WARTEZIMMER_COMPOSE_PROFILE = previousProfile;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function withInstall(run: (home: string) => void): void {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-token-migration-'));
  try {
    run(home);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

test('maintenance token migration atomically adds a token to an existing env', () => {
  withInstall((home) => {
    const envPath = path.join(home, '.env');
    fs.writeFileSync(envPath, '# existing install\nPRACTICE_DISPLAY_NAME=Meyer\n');

    const result = migrateMaintenanceToken(home, () => 'm'.repeat(32));

    assert.deepEqual(result, { migrated: true, token: 'm'.repeat(32) });
    assert.equal(readEnvMap(envPath).get('PRACTICE_DISPLAY_NAME'), 'Meyer');
    assert.equal(readEnvMap(envPath).get('MAINTENANCE_TOKEN'), 'm'.repeat(32));
    assert.match(fs.readFileSync(envPath, 'utf8'), /^# existing install/m);
  });
});

test('maintenance token migration replaces weak tokens once and then remains idempotent', () => {
  withInstall((home) => {
    const envPath = path.join(home, '.env');
    fs.writeFileSync(envPath, 'MAINTENANCE_TOKEN=change-me-maintenance-token\n');
    let generations = 0;
    const generate = () => {
      generations += 1;
      return 's'.repeat(32);
    };

    assert.equal(migrateMaintenanceToken(home, generate).migrated, true);
    assert.equal(migrateMaintenanceToken(home, generate).migrated, false);
    assert.equal(generations, 1);
    assert.equal(readEnvMap(envPath).get('MAINTENANCE_TOKEN'), 's'.repeat(32));
  });
});

test('maintenance token migration ignores a token inherited through process.env', () => {
  withInstall((home) => {
    fs.writeFileSync(path.join(home, '.env'), 'PRACTICE_DISPLAY_NAME=Meyer\n');
    const previous = process.env.MAINTENANCE_TOKEN;
    process.env.MAINTENANCE_TOKEN = 'process-token-that-must-not-win-1234';
    try {
      migrateMaintenanceToken(home, () => 'f'.repeat(32));
      assert.equal(readEnvMap(path.join(home, '.env')).get('MAINTENANCE_TOKEN'), 'f'.repeat(32));
    } finally {
      if (previous === undefined) delete process.env.MAINTENANCE_TOKEN;
      else process.env.MAINTENANCE_TOKEN = previous;
    }
  });
});

test('maintenance token migration does not create env for an uninstalled home', () => {
  withInstall((home) => {
    assert.deepEqual(
      migrateMaintenanceToken(home, () => 'n'.repeat(32)),
      {
        migrated: false,
        token: null,
      },
    );
    assert.equal(fs.existsSync(path.join(home, '.env')), false);
  });
});

test('resolving an install context does not rotate the running stack token', () => {
  withInstall((home) => {
    const envPath = path.join(home, '.env');
    fs.writeFileSync(envPath, 'MAINTENANCE_TOKEN=change-me-maintenance-token\n');
    const previousHome = process.env.WARTEZIMMER_HOME;
    const previousTemplateRoot = process.env.WARTEZIMMER_TEMPLATE_ROOT;
    process.env.WARTEZIMMER_HOME = home;
    process.env.WARTEZIMMER_TEMPLATE_ROOT = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../..',
    );
    try {
      assert.equal(resolveSetupContext().home, home);
      assert.equal(readEnvMap(envPath).get('MAINTENANCE_TOKEN'), 'change-me-maintenance-token');
    } finally {
      if (previousHome === undefined) delete process.env.WARTEZIMMER_HOME;
      else process.env.WARTEZIMMER_HOME = previousHome;
      if (previousTemplateRoot === undefined) delete process.env.WARTEZIMMER_TEMPLATE_ROOT;
      else process.env.WARTEZIMMER_TEMPLATE_ROOT = previousTemplateRoot;
    }
  });
});

test('bootstrap leaves templates untouched while an unreadable update journal exists', async (t) => {
  const { updateOperationPath } = await import('./update-operation.js');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-update-bootstrap-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.mkdirSync(path.dirname(updateOperationPath(home)), { recursive: true });
  fs.writeFileSync(updateOperationPath(home), '{broken');
  assert.deepEqual(ensureInstallHomeLayout(home, '/unused-template-root'), []);
  assert.deepEqual(fs.readdirSync(home), ['operations']);
  assert.equal(fs.readFileSync(updateOperationPath(home), 'utf8'), '{broken');
});

test('bootstrap leaves restore recovery state untouched, including an unreadable journal', async (t) => {
  const { restoreOperationPath } = await import('./restore-operation.js');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-restore-bootstrap-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.mkdirSync(path.dirname(restoreOperationPath(home)), { recursive: true });
  fs.writeFileSync(restoreOperationPath(home), '{broken');
  assert.deepEqual(ensureInstallHomeLayout(home, '/unused-template-root'), []);
  assert.deepEqual(fs.readdirSync(home), ['operations']);
});

test('bootstrap leaves tls recovery state untouched, including an unreadable journal', async (t) => {
  const { tlsOperationPath } = await import('./tls-operation.js');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-tls-bootstrap-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.mkdirSync(path.dirname(tlsOperationPath(home)), { recursive: true });
  fs.writeFileSync(tlsOperationPath(home), '{broken');
  assert.deepEqual(ensureInstallHomeLayout(home, '/unused-template-root'), []);
  assert.deepEqual(fs.readdirSync(home), ['operations']);
});
