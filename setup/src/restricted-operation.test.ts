import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  beginRestrictedOperation,
  durableWrite,
  readRestrictedOperation,
  restrictedOperationDir,
  restrictedOperationEnv,
} from './restricted-operation.js';
import { composeUp, composeRestart, composeValidateConfig } from './docker.js';
import { readEnvMap } from './env-file.js';

for (const enable of [true, false])
  test(`SIGKILL during ${enable ? 'apply' : 'remove'} is recovered closed before ordinary start`, async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-crash-'));
    const previousCli = process.env.WARTEZIMMER_DOCKER_CLI;
    try {
      fs.writeFileSync(
        path.join(home, '.env'),
        `PROXY_ENABLED=true\nPROXY_MODE=tls-managed\nSETUP_LAN_APP_IP=127.0.0.1\nAPP_BIND_ADDRESS=127.0.0.1\nTLS_MODE=managed\nTLS_HOSTNAME=staff.test.example\nTLS_STAFF_HOSTNAME=staff.test.example\nTLS_PORTAL_HOSTNAME=portal.test.example\nTLS_WILDCARD_CERTIFICATE_NAME=*.test.example\nSETUP_RESTRICTED_APP_IP=127.0.0.2\nSETUP_RESTRICTED_ENABLED=${!enable}\n`,
      );
      fs.writeFileSync(path.join(home, 'docker-compose.yml'), 'services: {}');
      const script = `import { beginRestrictedOperation, durableWrite, restrictedOperationEnv } from ${JSON.stringify(new URL('./restricted-operation.ts', import.meta.url).href)}; const op = beginRestrictedOperation(process.argv[1], ${enable}); durableWrite(restrictedOperationEnv(process.argv[1], op.id), op.previousEnv + '\\nSETUP_RESTRICTED_ENABLED=${enable}\\n'); process.kill(process.pid, 'SIGKILL');`;
      const child = spawnSync(process.execPath, [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        script,
        home,
      ]);
      assert.equal(child.signal, 'SIGKILL', child.stderr.toString());
      assert.equal(
        readRestrictedOperation(home)?.action,
        enable ? 'pending-apply' : 'pending-remove',
      );
      assert.equal(
        readEnvMap(path.join(home, '.env')).get('SETUP_RESTRICTED_ENABLED'),
        String(!enable),
      );
      const cli = path.join(home, 'docker-mock');
      fs.writeFileSync(
        cli,
        '#!/bin/sh\nprintf "%s\\n" "$*" >> "' +
          path.join(home, 'commands') +
          '"\ncase "$1" in ps) printf "aaaaaaaaaaaa\\n";; esac\n',
        { mode: 0o755 },
      );
      process.env.WARTEZIMMER_DOCKER_CLI = cli;
      const options = { projectRoot: home, composeProjectName: 'crash-test', build: false };
      const result = enable ? await composeUp(options) : await composeRestart(options);
      assert.equal(result.ok, true, result.log);
      assert.equal(readEnvMap(path.join(home, '.env')).has('SETUP_RESTRICTED_ENABLED'), false);
      assert.equal(readRestrictedOperation(home), null);
      assert.doesNotMatch(
        fs.readFileSync(path.join(home, 'state/tls/Caddyfile'), 'utf8'),
        /:444 \{/,
      );
      const commands = fs.readFileSync(path.join(home, 'commands'), 'utf8');
      assert.ok(commands.indexOf('rm -f aaaaaaaaaaaa') >= 0);
      assert.ok(commands.indexOf('rm -f aaaaaaaaaaaa') < commands.indexOf('up -d'));
      assert.doesNotMatch(
        commands.split('\n').find((line) => line.includes('up -d'))!,
        /proxy-restricted/,
      );
    } finally {
      if (previousCli === undefined) delete process.env.WARTEZIMMER_DOCKER_CLI;
      else process.env.WARTEZIMMER_DOCKER_CLI = previousCli;
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

test('live operations exclude another start and stage restart:no without changing committed env', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-pending-'));
  const previousCli = process.env.WARTEZIMMER_DOCKER_CLI;
  try {
    fs.writeFileSync(
      path.join(home, '.env'),
      'PROXY_ENABLED=true\nPROXY_MODE=tls-managed\nSETUP_RESTRICTED_ENABLED=false\n',
    );
    const op = beginRestrictedOperation(home, true);
    assert.throws(() => beginRestrictedOperation(home, true));
    durableWrite(
      restrictedOperationEnv(home, op.id),
      op.previousEnv.replace('ENABLED=false', 'ENABLED=true'),
    );
    await assert.rejects(
      () => composeUp({ projectRoot: home, composeProjectName: 'pending', build: false }),
      /läuft bereits/,
    );
    const cli = path.join(home, 'docker-mock');
    fs.writeFileSync(cli, '#!/bin/sh\nprintf "%s" "$*"\n', { mode: 0o755 });
    process.env.WARTEZIMMER_DOCKER_CLI = cli;
    const validated = await composeValidateConfig({
      projectRoot: home,
      composeProjectName: 'pending',
      restrictedOperationId: op.id,
    });
    assert.match(validated.log, /candidate.env/);
    assert.match(validated.log, /proxy-restricted/);
    assert.match(
      fs.readFileSync(path.join(restrictedOperationDir(home), 'compose.yml'), 'utf8'),
      /restart: "no"/,
    );
    assert.equal(readEnvMap(path.join(home, '.env')).get('SETUP_RESTRICTED_ENABLED'), 'false');
  } finally {
    if (previousCli === undefined) delete process.env.WARTEZIMMER_DOCKER_CLI;
    else process.env.WARTEZIMMER_DOCKER_CLI = previousCli;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
