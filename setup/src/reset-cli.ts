#!/usr/bin/env node
import * as p from '@clack/prompts';
import { resetInstallHome } from './reset-install-home.js';
import { describeInstallHomeTargets, resolveSetupContext } from './setup-context.js';

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  const keepFiles = hasFlag('--keep-files');
  const ctx = resolveSetupContext();
  const targets = describeInstallHomeTargets();

  p.intro('Wartezimmer — Install zurücksetzen');

  if (ctx.mode === 'repo' && !targets.envOverride) {
    p.log.warn(
      'Kein WARTEZIMMER_HOME gesetzt — es wird das Monorepo zurückgesetzt (.env, Container wartezimmer).',
    );
    p.log.warn('Für Test-Installs: WARTEZIMMER_HOME=/tmp/pf-dev-001 npm run setup:reset');
  }

  p.log.message(`Home: ${ctx.home}`);
  p.log.message(`Compose-Projekt: ${ctx.composeProjectName}`);

  if (!hasFlag('--yes')) {
    const confirmed = await p.confirm({
      message: keepFiles
        ? 'Container stoppen (Dateien behalten)?'
        : 'Container stoppen und Install-Dateien löschen?',
      initialValue: false,
    });
    if (confirmed !== true) {
      p.outro('Abgebrochen');
      process.exit(0);
    }
  }

  const spinner = p.spinner();
  spinner.start('Setze Install zurück …');

  try {
    const result = await resetInstallHome(ctx, { keepFiles });
    spinner.stop('Zurücksetzen abgeschlossen');

    if (result.compose) {
      if (result.compose.ok) {
        p.log.success('Docker Compose gestoppt');
      } else {
        p.log.warn('Docker Compose down meldete Fehler (Home wurde trotzdem bereinigt)');
        if (result.compose.log) {
          p.note(result.compose.log, 'Compose-Log');
        }
      }
    }

    if (result.removedHome) {
      p.log.success('Install-Dateien entfernt');
    } else if (keepFiles) {
      p.log.info('.env und Compose-Dateien behalten');
    }

    p.outro('Bereit für einen neuen Setup-Durchlauf');
  } catch (error) {
    spinner.stop('Fehler');
    p.log.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
