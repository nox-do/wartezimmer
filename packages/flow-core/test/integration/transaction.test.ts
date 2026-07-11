import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import { openDb, createRuntime } from '@praxis-flow/flow-core/server';

const workerPath = fileURLToPath(new URL('./parallel-checkin-worker.ts', import.meta.url));
const workerExecArgv = ['--import', 'tsx'];

function testRuntime(options: { testHooks?: { failAfter?: string } } = {}) {
  const db = openDb({ path: ':memory:' });
  return { db, runtime: createRuntime(db, options) };
}

function countRows(db: DatabaseSync, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
}

test('checkIn rollback: Event-Fehler hinterlässt keinen halben Check-in', () => {
  const { db, runtime } = testRuntime({ testHooks: { failAfter: 'checkIn:event:routed' } });

  assert.throws(
    () => runtime.checkIn({ topicId: 'general', displayName: 'Rollback', surfaceId: 'terminal_1' }),
    /TEST_FAILURE:checkIn:event:routed/
  );

  assert.equal(countRows(db, 'patients'), 0);
  assert.equal(countRows(db, 'visits'), 0);
  assert.equal(countRows(db, 'visit_topics'), 0);
  assert.equal(countRows(db, 'visit_events'), 0);
  assert.equal(countRows(db, 'daily_queue_counters'), 0);
});

test('transition rollback: Journey-Advance-Fehler rollt Transition zurück', () => {
  const { db, runtime } = testRuntime({ testHooks: { failAfter: 'journeyAdvance:update' } });
  const created = runtime.checkIn({ topicId: 'general', displayName: 'Trans', surfaceId: 'terminal_1' });
  runtime.transition(created.id, 'call');

  assert.throws(
    () => runtime.transition(created.id, 'arrive'),
    /TEST_FAILURE:journeyAdvance:update/
  );

  const visit = db.prepare('SELECT status, journey_step_index FROM visits WHERE id = ?').get(created.id);
  assert.equal(visit.status, 'called');
  assert.equal(visit.journey_step_index, 0);
  assert.equal(countRows(db, 'visit_events'), 3);
});

test('redirect rollback: Event-Fehler rollt Visit-Update zurück', () => {
  const { db, runtime } = testRuntime({ testHooks: { failAfter: 'redirect:event' } });
  const created = runtime.checkIn({ topicId: 'general', displayName: 'Redir', surfaceId: 'terminal_1' });
  const before = db.prepare('SELECT target_location_id, queue_id FROM visits WHERE id = ?').get(created.id);

  assert.throws(
    () => runtime.redirect(created.id, {
      queueId: 'lab_queue',
      targetLocationId: 'lab',
      movementMode: 'call',
      publicDisplayMode: 'visible'
    }),
    /TEST_FAILURE:redirect:event/
  );

  const after = db.prepare('SELECT target_location_id, queue_id FROM visits WHERE id = ?').get(created.id);
  assert.equal(after.target_location_id, before.target_location_id);
  assert.equal(after.queue_id, before.queue_id);
  assert.equal(countRows(db, 'visit_events'), 2);
});

test('saveJourneyTemplate rollback: Insert-Fehler behält alte Steps', () => {
  const { db, runtime } = testRuntime({ testHooks: { failAfter: 'journeyTemplate:insertStep' } });
  const existing = db
    .prepare('SELECT id, sort_order FROM journey_steps WHERE template_id = ? ORDER BY sort_order')
    .all('journey_general') as Array<{ id: string; sort_order: number }>;
  const beforeSteps = db.prepare('SELECT COUNT(*) AS count FROM journey_steps WHERE template_id = ?').get('journey_general').count;
  const beforeName = db.prepare('SELECT name FROM journey_templates WHERE id = ?').get('journey_general').name;

  assert.throws(
    () => runtime.saveJourneyTemplate('journey_general', {
      name: 'Neuer Name',
      topicId: 'general',
      active: true,
      steps: [
        { id: existing[0].id, sortOrder: 0, targetLocationId: 'reception', queueId: 'general_queue', movementMode: 'call', publicDisplayMode: 'visible', completedWhen: 'arrive' },
        { id: existing[1].id, sortOrder: 1, targetLocationId: 'room_1', queueId: null, movementMode: 'call', publicDisplayMode: 'hidden', completedWhen: 'start' },
        { sortOrder: 3, targetLocationId: 'lab', queueId: null, movementMode: 'self_go', publicDisplayMode: 'hidden', completedWhen: 'done' }
      ]
    }),
    /TEST_FAILURE:journeyTemplate:insertStep/
  );

  assert.equal(
    db.prepare('SELECT COUNT(*) AS count FROM journey_steps WHERE template_id = ?').get('journey_general').count,
    beforeSteps
  );
  assert.equal(
    db.prepare('SELECT name FROM journey_templates WHERE id = ?').get('journey_general').name,
    beforeName
  );
});

test('saveJourneyTemplate: bestehende Steps werden fortgeschrieben statt komplett ersetzt', () => {
  const { db, runtime } = testRuntime();
  const before = db
    .prepare('SELECT id, sort_order FROM journey_steps WHERE template_id = ? ORDER BY sort_order')
    .all('journey_general') as Array<{ id: string; sort_order: number }>;

  runtime.saveJourneyTemplate('journey_general', {
    name: 'Sprechstunde Standard',
    topicId: 'general',
    active: true,
    steps: [
      {
        id: before[1].id,
        sortOrder: 1,
        targetLocationId: 'room_2',
        queueId: null,
        movementMode: 'call',
        publicDisplayMode: 'hidden',
        completedWhen: 'arrive',
      },
      {
        id: before[2].id,
        sortOrder: 2,
        targetLocationId: 'room_1',
        queueId: null,
        movementMode: 'pickup',
        publicDisplayMode: 'hidden',
        completedWhen: 'start',
      },
      {
        sortOrder: 3,
        targetLocationId: 'lab',
        queueId: null,
        movementMode: 'self_go',
        publicDisplayMode: 'hidden',
        completedWhen: 'done',
      },
    ],
  });

  const after = db
    .prepare('SELECT id, sort_order, target_location_id FROM journey_steps WHERE template_id = ? ORDER BY sort_order')
    .all('journey_general') as Array<{ id: string; sort_order: number; target_location_id: string | null }>;

  assert.equal(after.length, 3);
  assert.equal(after[0].sort_order, 1);
  assert.equal(after[0].id, before[1].id);
  assert.equal(after[1].sort_order, 2);
  assert.equal(after[1].id, before[2].id);
  assert.equal(after[2].sort_order, 3);
  assert.equal(after[2].target_location_id, 'lab');
  assert.ok(!before.some((step) => step.id === after[2].id));
});

test('saveJourneyTemplate: fremde Step-ID wird abgelehnt', () => {
  const { db, runtime } = testRuntime();
  db.prepare('INSERT INTO journey_templates VALUES (?, ?, ?, ?)').run('journey_other', 'Andere Journey', 'general', 1);
  db.prepare('INSERT INTO journey_steps VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'step_other_0',
    'journey_other',
    0,
    'lab',
    null,
    'self_go',
    'hidden',
    'done',
    null,
  );

  assert.throws(
    () => runtime.saveJourneyTemplate('journey_general', {
      name: 'Sprechstunde Standard',
      topicId: 'general',
      active: true,
      steps: [
        {
          id: 'step_other_0',
          sortOrder: 0,
          targetLocationId: 'reception',
          queueId: 'general_queue',
          movementMode: 'call',
          publicDisplayMode: 'visible',
          completedWhen: 'arrive',
        },
      ],
    }),
    /JOURNEY_STEP_TEMPLATE_MISMATCH/
  );
});

test('20 parallele Check-ins: keine doppelten queueNumbers', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'routing-core-'));
  const dbPath = join(dir, 'parallel.sqlite');
  openDb({ path: dbPath });

  const workers = Array.from({ length: 20 }, (_, index) => new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, { workerData: { dbPath, index }, execArgv: workerExecArgv });
    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`worker exited with ${code}`));
    });
  }));

  const queueNumbers = await Promise.all(workers);
  assert.equal(queueNumbers.length, 20);
  assert.equal(new Set(queueNumbers).size, 20);

  rmSync(dir, { recursive: true, force: true });
});

test('allocateQueueSequence: sequentielle Lane-Nummern ohne Lücken', () => {
  const { db } = testRuntime();
  const today = new Date().toISOString().slice(0, 10);
  const runtime = createRuntime(db);
  const numbers = Array.from({ length: 5 }, () =>
    runtime.checkIn({ topicId: 'general', surfaceId: 'terminal_1' }).queueNumber
  );

  assert.deepEqual(numbers, ['A-001', 'A-002', 'A-003', 'A-004', 'A-005']);
  const counter = db.prepare('SELECT next_value FROM daily_queue_counters WHERE scope = ? AND counter_date = ?').get('lane:A', today);
  assert.equal(counter?.next_value ?? numbers.length, 5);
});

test('Lane-Counter: getrennte Nummernkreise pro Topic-Lane', () => {
  const { runtime } = testRuntime();
  const general = runtime.checkIn({ topicId: 'general', surfaceId: 'terminal_1' });
  const infection = runtime.checkIn({ topicId: 'infection', surfaceId: 'terminal_1' });
  const vaccine = runtime.checkIn({ topicId: 'vaccine', surfaceId: 'terminal_1' });
  const mfa = runtime.checkIn({ mfaAssist: true, surfaceId: 'terminal_1' });

  assert.equal(general.queueNumber, 'A-001');
  assert.equal(general.queueLaneCode, 'A');
  assert.equal(infection.queueNumber, 'I-001');
  assert.equal(infection.queueLaneCode, 'I');
  assert.equal(vaccine.queueNumber, 'X-001');
  assert.equal(vaccine.queueLaneCode, 'X');
  assert.equal(mfa.queueNumber, 'M-001');
  assert.equal(mfa.queueLaneCode, 'M');
});

test('Lane A: general und op_prep teilen Nummernkreis', () => {
  const { runtime } = testRuntime();
  const general = runtime.checkIn({ topicId: 'general', surfaceId: 'terminal_1' });
  const opPrep = runtime.checkIn({ topicId: 'op_prep', surfaceId: 'terminal_1' });

  assert.equal(general.queueNumber, 'A-001');
  assert.equal(opPrep.queueNumber, 'A-002');
  assert.equal(general.queueLaneCode, 'A');
  assert.equal(opPrep.queueLaneCode, 'A');
});
