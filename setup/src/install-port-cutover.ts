import { setTimeout as delay } from 'node:timers/promises';
import { recordPublishFailure } from './port-check-diagnostics.js';
import { trackPortRecovery } from './port-check-history.js';
import fs from 'node:fs';
import type { SetupContext } from './setup-context.js';
import { installPortStopReceipt, readInstallOperation } from './install-operation.js';
import { durableWrite } from './restricted-operation.js';
import { runDockerCommand } from './docker-cli.js';
import { requirePorts, waitForProjectPortChecks, type PortTarget } from './port-check.js';

export async function recoverInstallPortTest(
  ctx: SetupContext,
  docker = runDockerCommand,
): Promise<void> {
  const operation = readInstallOperation(ctx.home);
  if (!operation) return;
  const file = installPortStopReceipt(ctx.home, operation.id);
  if (!fs.existsSync(file)) return;
  const ids: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    !ids.every((id) => typeof id === 'string' && /^[0-9a-f]{64}$/.test(id))
  )
    throw new Error('Ungültiger Wiederanlaufstatus der Portprüfung.');
  await waitForProjectPortChecks(ctx.composeProjectName, docker);
  for (const id of ids) {
    const state = await docker(
      [
        'inspect',
        '--format',
        '{{index .Config.Labels "com.docker.compose.project"}} {{.State.Running}}',
        id,
      ],
      { timeoutMs: 8000 },
    );
    if (state.code !== 0 || !state.stdout.startsWith(ctx.composeProjectName + ' '))
      throw new Error('Der vorherige Container konnte nicht eindeutig zugeordnet werden.');
    if (state.stdout.trim().endsWith(' false')) {
      const start = await docker(['start', id], { timeoutMs: 30000 });
      if (start.code !== 0) {
        recordPublishFailure(ctx.home, start.stderr);
        throw new Error(
          'Der vorherige Betrieb konnte nach der Portprüfung nicht gestartet werden. Bitte die Docker-Portfreigaben prüfen.',
        );
      }
    }
  }
  const deadline = Date.now() + 90000;
  while (true) {
    const check = await docker(
      [
        'inspect',
        '--format',
        '{{.State.Running}} {{if .State.Health}}{{.State.Health.Status}}{{else}}ready{{end}}',
        ...ids,
      ],
      { timeoutMs: 10000 },
    );
    const states = check.stdout.trim().split(/\r?\n/);
    if (
      check.code === 0 &&
      states.length === ids.length &&
      states.every((line) => /^true (ready|healthy)$/.test(line))
    )
      break;
    if (check.code !== 0 || Date.now() >= deadline)
      throw new Error(
        'Der Zustand der zuvor laufenden Container konnte nach dem Neustart nicht bestätigt werden.',
      );
    await delay(750);
  }
  fs.unlinkSync(file);
}
/** Stop only after all free targets have passed. A crash before reset leaves a restart receipt. */
export async function checkBeforeInstallReset(
  ctx: SetupContext,
  id: string,
  targets: PortTarget[],
  replace: boolean,
  markInstalling: () => void,
  docker = runDockerCommand,
): Promise<void> {
  await recoverInstallPortTest(ctx, docker);
  let deferred = false;
  for (const target of targets) {
    const report = await requirePorts(ctx, target);
    deferred ||= Boolean(report?.rows.some((row) => row.state === 'owned'));
  }
  if (!deferred || !replace) return markInstalling();
  const ps = await docker(
    [
      'ps',
      '--no-trunc',
      '-q',
      '--filter',
      'label=com.docker.compose.project=' + ctx.composeProjectName,
    ],
    { timeoutMs: 10000 },
  );
  if (ps.code !== 0)
    throw new Error('Laufende Dienste konnten vor der Neuinstallation nicht ermittelt werden.');
  const ids = ps.stdout.trim().split(/\s+/).filter(Boolean);
  if (!ids.length) {
    for (const target of targets) await requirePorts(ctx, target);
    return markInstalling();
  }
  const file = installPortStopReceipt(ctx.home, id);
  durableWrite(file, JSON.stringify(ids));
  try {
    const stop = await docker(['stop', ...ids], { timeoutMs: 90000 });
    if (stop.code !== 0)
      throw new Error(
        'Die bisherigen Dienste konnten für die Portprüfung nicht angehalten werden.',
      );
    for (const target of targets) {
      const report = await requirePorts(ctx, target);
      if (report?.rows.some((row) => row.state === 'owned'))
        throw new Error('Ein Port wird weiterhin von der bisherigen Installation belegt.');
    }
    markInstalling();
    fs.unlinkSync(file);
  } catch (error) {
    const recordRecovery = trackPortRecovery(ctx.home, [String(error)]);
    try {
      await recoverInstallPortTest(ctx, docker);
    } catch (recovery) {
      recordRecovery(false);
      throw new Error(String(error) + ' ' + String(recovery), { cause: recovery });
    }
    recordRecovery(true);
    throw error;
  }
}
