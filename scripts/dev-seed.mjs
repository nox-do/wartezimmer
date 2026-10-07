#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(
    'npm run dev:seed -- [--patients 19] [--rooms 5]\nLokales Docker Compose: Praxis-Belegung auf die Gesamtzahl aktiver Patienten auffüllen. App wird kurz pausiert.',
  );
} else {
  try {
    const options = { patients: 19, rooms: 5 };
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i].replace(/^--/, '');
      const max = key === 'patients' ? 200 : 20;
      const value = Number(args[i + 1]);
      if (
        !args[i].startsWith('--') ||
        !Object.hasOwn(options, key) ||
        !Number.isInteger(value) ||
        value < 1 ||
        value > max
      ) {
        throw new Error('Optionen: --patients 1..200 und --rooms 1..20');
      }
      options[key] = value;
    }
    const compose = (...params) => {
      const result = spawnSync('docker', ['compose', '-f', 'docker-compose.yml', ...params], {
        cwd: repoRoot,
        stdio: 'inherit',
      });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(`Docker Compose fehlgeschlagen (${result.status}).`);
    };
    // Check the running container before stopping anything. Never override NODE_ENV.
    compose(
      'exec',
      '-T',
      'app',
      'node',
      '-e',
      "if(process.env.NODE_ENV!=='development'){console.error('Nur für den Entwicklungsstack (NODE_ENV=development).');process.exit(1)}",
    );
    const source = fs.readFileSync(new URL('./dev-seed-data.mjs', import.meta.url), 'utf8');
    const payload = `import { getCoreDatabase } from '/app/app/dist/shared/db/database.js';
import path from 'node:path';\n${source}\ntry { if (process.env.NODE_ENV !== 'development') throw new Error('Nur für NODE_ENV=development.'); const core = getCoreDatabase(); appendDevContacts(path.join(process.env.CONTACT_LOOKUP_BASE_PATH ?? '/imports', 'kontakte.csv')); console.log(JSON.stringify(seedDevData(core, ${JSON.stringify(options)}), null, 2)); } catch (error) { console.error(error.message); process.exitCode = 1; }`;
    compose('stop', 'app');
    try {
      const result = spawnSync(
        'docker',
        [
          'compose',
          '-f',
          'docker-compose.yml',
          'run',
          '--rm',
          '--no-deps',
          '-T',
          'app',
          'node',
          '--input-type=module',
        ],
        { cwd: repoRoot, input: payload, stdio: ['pipe', 'inherit', 'inherit'] },
      );
      if (result.error) throw result.error;
      if (result.status !== 0)
        throw new Error(
          'Demo-Daten konnten nicht vollständig angelegt werden; erneuter Aufruf füllt fehlende Daten auf.',
        );
    } finally {
      compose('start', 'app');
    }
    console.log('Demo-Belegung bereit. Oberfläche neu laden.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
