#!/usr/bin/env node
/**
 * Create a text-only, reproducible source dump for a Praxis Flow workspace area.
 * Existing dumps are never overwritten; remove or rename one deliberately first.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT_CONFIG_FILES = [
  'package.json',
  'package-lock.json',
  'tsconfig.base.json',
  'eslint.config.js',
  'prettier.config.cjs',
  'stylelint.config.js',
  '.editorconfig',
  '.gitignore',
];

const AREA_PATHS = {
  manager: ['manager'],
  core: [
    'README.md',
    'app',
    'ui',
    'openapi',
    'packages/domain',
    'packages/flow-core',
    'packages/server-shared',
    'docs/flows.md',
    'docs/architecture/README.md',
    'docs/architecture/apis.md',
    'docs/architecture/domain.md',
    'docs/architecture/realtime.md',
    'docs/architecture/routing.md',
    'docs/architecture/system.md',
  ],
  app: ['app', 'packages/domain', 'packages/flow-core', 'packages/server-shared', 'openapi'],
  sandbox: ['sandbox', 'packages/server-shared'],
  ui: ['ui', 'packages/domain'],
  setup: [
    'setup',
    'scripts',
    'proxy',
    'docker-compose.yml',
    'docker-compose.delivery.yml',
    'docker-compose.proxy.yml',
    'docker-compose.proxy.delivery.yml',
    'docker-compose.proxy-tls.yml',
    'docker-compose.proxy-tls.delivery.yml',
    'docker-compose.proxy-restricted.yml',
    'docker-compose.proxy-restricted.delivery.yml',
  ],
};

// One-shot review packet for the F-01..F-16 remediation and its day-reset follow-up.
// Unlike the broad area dumps, this deliberately includes focused tests and decision context.
const REVIEW_SECTIONS = [
  {
    note: 'F-01: completed exports survive uncertain sandbox deletion; partial files are cleaned before retry.',
    paths: [
      'app/src/shared/documents/filesystem-export.ts',
      'app/src/shared/documents/filesystem-export.test.ts',
      'app/src/shared/sandbox/sandbox-client.ts',
    ],
  },
  {
    note: 'F-02: auth booleans are parsed strictly and production requires effective client authentication.',
    paths: ['app/src/auth/client-auth.ts', 'app/src/auth/client-auth.test.ts'],
  },
  {
    note: 'F-03 decision: the known 0000 bootstrap PIN is real, but enforcement is deferred until a non-locking first-install/reset workflow is specified; the unused partial-default helper was removed.',
    paths: [
      'app/src/auth/staff-pin-auth.ts',
      'app/src/shared/db/database-auth-settings.ts',
      'app/src/routes/auth-routes.ts',
      'docs/operations/runtime.md',
    ],
  },
  {
    note: 'F-04: staff-session expiry actively revokes listeners so open queue and ops SSE streams close without a later lookup; heartbeats do not renew idle TTL.',
    paths: [
      'app/src/auth/staff-session-manager.ts',
      'app/src/routes/queue-stream-routes.ts',
      'app/src/routes/queue-stream-routes.test.ts',
      'app/src/routes/ops/ops-stream-routes.ts',
      'app/src/routes/ops/ops-stream-routes.test.ts',
    ],
  },
  {
    note: 'F-05/F-06: journey IDs and template ownership are validated before catalog projection; same-location arrival completion follows the documented transition semantics.',
    paths: [
      'app/src/shared/journey-settings.ts',
      'app/src/shared/journey-settings.test.ts',
      'app/src/shared/ops/journey-template-guard.ts',
      'app/src/shared/ops/journey-template-guard.test.ts',
      'app/src/shared/flow-core/sync-catalog-from-ops-settings.ts',
      'app/src/shared/flow-core/sync-catalog-from-ops-settings.test.ts',
      'packages/flow-core/src/shared/journey.ts',
      'packages/flow-core/test/unit/journey.test.ts',
    ],
  },
  {
    note: 'F-07/F-08: capacity is enforced in the authoritative host transition and check-in responses expose the actual resulting status.',
    paths: [
      'app/src/routes/checkin-routes.ts',
      'app/src/routes/checkin-routes.test.ts',
      'app/src/shared/flow-core/flow-core-checkin.ts',
      'app/src/shared/flow-core/flow-core-checkin.test.ts',
      'app/src/shared/flow-core/visit-queue-bridge.ts',
      'app/src/shared/flow-core/visit-queue-bridge.test.ts',
    ],
  },
  {
    note: 'F-09/F-10: indexed and scanned contact lookup share identity/ambiguity semantics; equal display names remain distinct candidates.',
    paths: [
      'app/src/shared/contacts/contact-lookup-runtime.ts',
      'app/src/shared/contacts/csv-contact-lookup.validate.test.ts',
      'ui/src/lib/components/mfa/MfaCheckinModal.svelte',
    ],
  },
  {
    note: 'F-11 plus contract cleanup: contact CSV is validated only when its configuration changes; explicit null clears the folder path. The cache is intentionally a business-day snapshot, not live file watching.',
    paths: [
      'app/src/routes/ops/ops-settings-mapper.ts',
      'app/src/routes/ops/ops-settings-mapper.test.ts',
      'app/src/shared/db/database-ops-settings.ts',
      'app/src/shared/db/database-ops-settings.test.ts',
      'app/src/shared/contacts/contact-lookup-cache.ts',
      'app/src/shared/contacts/contact-lookup-scan-cache.ts',
      'app/src/shared/contacts/contact-lookup-preview.ts',
      'app/src/shared/contacts/contact-lookup-day-refresh.ts',
    ],
  },
  {
    note: 'F-12: topic and room editors send only their changed collection and use expectedUpdatedAt compare-and-swap to reject stale writes.',
    paths: [
      'app/src/routes/ops/ops-settings-patch-by-role.ts',
      'app/src/routes/ops/ops-settings-patch-by-role.test.ts',
      'app/src/routes/ops/ops-settings-routes.ts',
      'app/src/routes/ops/ops-settings-routes.test.ts',
      'ui/src/lib/mfa/topics-rooms-settings.ts',
      'ui/src/lib/ops/openapi-types.ts',
      'ui/src/routes/mfa/settings/topics-rooms/+page.svelte',
      'ui/src/routes/mfa/settings/topics-rooms/topics/+page.svelte',
      'openapi/ops.yaml',
    ],
  },
  {
    note: 'F-13: the check-in modal reloads the time-dependent topic catalog on every open; failed or stale requests are not cached as success.',
    paths: ['ui/src/lib/components/mfa/MfaCheckinModal.svelte'],
  },
  {
    note: 'F-14: portable core transitions reject terminal visits and require an active journey before starting its next step.',
    paths: [
      'packages/flow-core/src/shared/visit-flow.ts',
      'packages/flow-core/test/unit/visit-flow.test.ts',
      'packages/flow-core/src/server/visit-service.ts',
      'packages/flow-core/test/integration/runtime.test.ts',
      'packages/flow-core/src/shared/labels.ts',
    ],
  },
  {
    note: 'F-15: existing active/absent visits lock topic and room identity changes; visit projection reads the immutable check-in topic label rather than a later catalog rename.',
    paths: [
      'app/src/shared/ops/topic-settings-guard.ts',
      'app/src/shared/ops/topic-settings-guard.test.ts',
      'app/src/shared/ops/room-removal-validation.ts',
      'app/src/shared/ops/room-removal-validation.test.ts',
      'app/src/shared/db/database.ts',
      'app/src/shared/db/ops-settings-errors.ts',
      'packages/flow-core/src/server/visit-repository.ts',
      'packages/flow-core/test/unit/visit-repository.test.ts',
      'packages/flow-core/src/shared/types.ts',
      'docs/architecture/domain.md',
      'docs/architecture/routing.md',
    ],
  },
  {
    note: 'F-16: is_anonymous now persists the Boolean with the correct polarity; no blind historical backfill was made because provenance cannot be established safely.',
    paths: [
      'packages/flow-core/src/server/visit-repository.ts',
      'packages/flow-core/test/unit/visit-repository.test.ts',
    ],
  },
  {
    note: 'Day-reset follow-up: check-in and intake are gated, active intake drains, sandbox purge completes before the DB reset, purge failure returns 503 and leaves the old day locked; restart remains best effort.',
    paths: [
      'app/src/routes/ops/ops-day-lifecycle-routes.ts',
      'app/src/routes/ops/ops-maintenance-routes.ts',
      'app/src/routes/ops/ops-sandbox-restart.ts',
      'app/src/routes/ops/ops-sandbox-restart.test.ts',
      'app/src/shared/sandbox/sandbox-intake-gate.ts',
      'app/src/shared/sandbox/sandbox-intake-gate.test.ts',
      'app/src/routes/patient-documents-routes.ts',
      'app/src/shared/db/database-day-lifecycle.ts',
      'app/src/shared/db/database-day-lifecycle.test.ts',
      'sandbox/src/routes/intake-routes.ts',
      'sandbox/src/intake-store.ts',
      'openapi/ops.yaml',
    ],
  },
  {
    note: 'Deliberate non-change: mark-away then callback-phone is retryable and its partial state is explicit; atomicity was not established as a product invariant.',
    paths: ['ui/src/lib/mfa/mfa-queue-commands.svelte.ts'],
  },
  {
    note: 'Deliberate non-change: deprecated portable admin methods still have package consumers, and programmatic test hooks have no HTTP or environment activation path.',
    paths: [
      'packages/flow-core/src/server/runtime.ts',
      'packages/flow-core/src/server/test-hooks.ts',
    ],
  },
  {
    note: 'Contract cleanup: destinationRoomLabel documents the visit operative routing/journey target; the obsolete topic-default label helper was removed.',
    paths: [
      'app/src/shared/checkin-topic-settings.ts',
      'app/src/shared/checkin-topic-settings.test.ts',
      'openapi/checkin.yaml',
    ],
  },
];

const REVIEW_PATHS = [...new Set(REVIEW_SECTIONS.flatMap((section) => section.paths))].sort();
const REVIEW_PREAMBLE = `# Praxis Flow focused remediation review
#
# Scope: F-01 through F-16 plus the synchronous sandbox purge/day-reset follow-up.
# This packet is intentionally curated and includes focused tests that broad dumps omit.
# REVIEW-NOTE lines record implementation decisions; verify them against the code and tests.
# Generated OpenAPI artifacts are omitted; source YAML is authoritative and generation drift is checked separately.
# Open questions intentionally not implemented here: mandatory default-PIN onboarding and a generation token for delayed recall-provider results.
`;

const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.tmp',
  '.svelte-kit',
  'build',
  'cache',
  'coverage',
  'data',
  'dist',
  'docs_data',
  'generated',
  'lab',
  'logs',
  'node_modules',
  'state',
  'test',
  'tests',
]);
const TEST_FILE = /(?:^|\.)test\.[^/]+$|(?:^|\.)spec\.[^/]+$/i;
const ENV_FILE = /^\.env(?:\..*)?$/i;
const LOCAL_DATA_FILE = /\.(?:log|sqlite|sqlite3|db|pem|key)$/i;

export function parseArea(args) {
  if (
    args.length !== 1 ||
    (!Object.hasOwn(AREA_PATHS, args[0]) && args[0] !== 'all' && args[0] !== 'review')
  ) {
    throw new Error(
      `Unknown area "${args.join(' ')}". Expected one of: ${[...Object.keys(AREA_PATHS), 'review', 'all'].join(', ')}.`,
    );
  }
  return args[0];
}

function isExcluded(relativePath) {
  const parts = relativePath.split('/');
  const name = parts.at(-1);
  return (
    parts.some((part) => EXCLUDED_DIRECTORIES.has(part)) ||
    (parts.includes('archive') && parts.includes('docs')) ||
    TEST_FILE.test(name) ||
    (ENV_FILE.test(name) && name !== '.env.example') ||
    LOCAL_DATA_FILE.test(name) ||
    relativePath === 'openapi/bundle.json' ||
    relativePath === 'scripts/dump.mjs' ||
    relativePath.startsWith('dumps/')
  );
}

export function isBinary(buffer) {
  if (buffer.includes(0)) return true;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return false;
  } catch {
    return true;
  }
}

function walk(root, relativeDirectory, files, skippedBinaries) {
  const absoluteDirectory = path.join(root, relativeDirectory);
  for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (isExcluded(relativePath)) continue;
    if (entry.isDirectory()) {
      walk(root, relativePath, files, skippedBinaries);
    } else if (entry.isFile()) {
      const content = fs.readFileSync(path.join(root, relativePath));
      if (isBinary(content)) skippedBinaries.push(relativePath);
      else files.add(relativePath);
    }
  }
}

export function selectPaths(area) {
  if (area === 'review') return REVIEW_PATHS;
  const areas = area === 'all' ? Object.keys(AREA_PATHS) : [area];
  const rootConfigFiles =
    area === 'core'
      ? ROOT_CONFIG_FILES.filter((relativePath) => relativePath !== 'package-lock.json')
      : ROOT_CONFIG_FILES;
  return [...new Set([...rootConfigFiles, ...areas.flatMap((name) => AREA_PATHS[name])])].sort();
}

export function collectFiles(root, area) {
  const files = new Set();
  const skippedBinaries = [];
  for (const relativePath of selectPaths(area)) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) throw new Error(`Required path is missing: ${relativePath}`);
    if (fs.statSync(absolutePath).isDirectory()) walk(root, relativePath, files, skippedBinaries);
    else if (area === 'review' || !isExcluded(relativePath)) {
      const content = fs.readFileSync(absolutePath);
      if (isBinary(content)) skippedBinaries.push(relativePath);
      else files.add(relativePath);
    }
  }
  return { files: [...files].sort(), skippedBinaries: skippedBinaries.sort() };
}

function normaliseText(buffer) {
  return buffer.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function reviewContext(relativePath) {
  return REVIEW_SECTIONS.filter((section) => section.paths.includes(relativePath))
    .map((section) => `# REVIEW-NOTE: ${section.note}`)
    .join('\n');
}

export function writeDump(root, area, date = new Date().toISOString().slice(0, 10)) {
  const { files, skippedBinaries } = collectFiles(root, area);
  const outputDirectory = path.join(root, 'dumps');
  const outputPath = path.join(outputDirectory, `dump_${area}_${date}.txt`);
  if (fs.existsSync(outputPath))
    throw new Error(`Refusing to overwrite existing dump: ${path.relative(root, outputPath)}`);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const body = files
    .map((relativePath) => {
      const context = area === 'review' ? `${reviewContext(relativePath)}\n` : '';
      return `#/${relativePath}\n${context}${normaliseText(fs.readFileSync(path.join(root, relativePath)))}`;
    })
    .join('\n');
  const output = area === 'review' ? `${REVIEW_PREAMBLE}\n${body}` : body;
  fs.writeFileSync(outputPath, output.endsWith('\n') ? output : `${output}\n`, 'utf8');
  return { outputPath, files, skippedBinaries };
}

export function main(
  args = process.argv.slice(2),
  root = path.resolve(path.dirname(SCRIPT_PATH), '..'),
) {
  const area = parseArea(args);
  const result = writeDump(root, area);
  console.log(
    `Created ${path.relative(root, result.outputPath)} with ${result.files.length} files.`,
  );
  if (result.skippedBinaries.length)
    console.error(`Skipped binary files: ${result.skippedBinaries.join(', ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    main();
  } catch (error) {
    console.error(`dump: ${error.message}`);
    process.exitCode = 1;
  }
}
