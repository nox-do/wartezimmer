import test from 'node:test';
import assert from 'node:assert/strict';
import {
  openDb,
  createRuntime,
  createCatalogRepository,
  createVisitRepository,
} from '@wartezimmer/flow-core/server';
import type { VisitPatch } from '@wartezimmer/flow-core';

function readVisitRow(db: ReturnType<typeof openDb>, id: string) {
  return db.prepare('SELECT * FROM visits WHERE id = ?').get(id) as Record<string, unknown>;
}

function visitRepositoryFor(db: ReturnType<typeof openDb>) {
  const catalogRepository = createCatalogRepository(db);
  return createVisitRepository(db, catalogRepository);
}

test('checkIn speichert is_anonymous mit der richtigen Boolean-Semantik', () => {
  const db = openDb({ path: ':memory:' });
  const runtime = createRuntime(db);
  const named = runtime.checkIn({
    topicId: 'general',
    displayName: 'Benannte Person',
    surfaceId: 'terminal_1',
  });
  const anonymous = runtime.checkIn({ topicId: 'general', surfaceId: 'terminal_1' });

  const readFlag = (visitId: string) =>
    (
      db
        .prepare(
          `SELECT patients.is_anonymous AS isAnonymous
           FROM visits JOIN patients ON patients.id = visits.patient_id
           WHERE visits.id = ?`,
        )
        .get(visitId) as { isAnonymous: number }
    ).isAnonymous;

  assert.equal(readFlag(named.id), 0);
  assert.equal(readFlag(anonymous.id), 1);
});

test('Visit-Projektion behaelt den Themenname vom Check-in', () => {
  const db = openDb({ path: ':memory:' });
  const runtime = createRuntime(db);
  const created = runtime.checkIn({
    topicId: 'general',
    displayName: 'Themen-Snapshot',
    surfaceId: 'terminal_1',
  });
  const originalLabel = created.topic?.name;
  db.prepare("UPDATE topics SET name = 'Umbenannt' WHERE id = 'general'").run();

  assert.equal(
    runtime.visits().find((visit) => visit.id === created.id)?.topic?.name,
    originalLabel,
  );
});

test('updateVisit: fehlender Key behaelt staffNote und journeyTemplateId', () => {
  const db = openDb({ path: ':memory:' });
  const runtime = createRuntime(db);
  const visitRepository = visitRepositoryFor(db);
  const created = runtime.checkIn({
    topicId: 'general',
    displayName: 'Patch',
    surfaceId: 'terminal_1',
    staffNote: 'Behalten',
  });
  const current = visitRepository.visitById(created!.id)!;

  visitRepository.updateVisit(current, { status: 'called' });
  const row = readVisitRow(db, created!.id);

  assert.equal(row.staff_note, 'Behalten');
  assert.equal(row.journey_template_id, 'journey_general');
  assert.equal(row.status, 'called');
});

test('updateVisit: null loescht staffNote und Timestamps', () => {
  const db = openDb({ path: ':memory:' });
  const runtime = createRuntime(db);
  const visitRepository = visitRepositoryFor(db);
  const created = runtime.checkIn({
    topicId: 'general',
    displayName: 'Clear',
    surfaceId: 'terminal_1',
    staffNote: 'Weg',
  });
  runtime.transition(created!.id, 'call');
  const current = visitRepository.visitById(created!.id)!;

  visitRepository.updateVisit(current, {
    staffNote: null,
    calledAt: null,
    arrivedAt: null,
    startedAt: null,
  });
  const row = readVisitRow(db, created!.id);

  assert.equal(row.staff_note, null);
  assert.equal(row.called_at, null);
  assert.equal(row.arrived_at, null);
  assert.equal(row.started_at, null);
});

test('updateVisit: null loescht journeyStepIndex ohne journeyTemplateId anzufassen', () => {
  const db = openDb({ path: ':memory:' });
  const runtime = createRuntime(db);
  const visitRepository = visitRepositoryFor(db);
  const created = runtime.checkIn({
    topicId: 'general',
    displayName: 'Journey',
    surfaceId: 'terminal_1',
  });
  const current = visitRepository.visitById(created!.id)!;

  visitRepository.updateVisit(current, {
    journeyStepIndex: null,
    journeyStepCompletedAt: null,
  });
  const row = readVisitRow(db, created!.id);

  assert.equal(row.journey_step_index, null);
  assert.equal(row.journey_step_completed_at, null);
  assert.equal(row.journey_template_id, 'journey_general');
});

test('updateVisit: explizites undefined wird abgelehnt', () => {
  const db = openDb({ path: ':memory:' });
  const runtime = createRuntime(db);
  const visitRepository = visitRepositoryFor(db);
  const created = runtime.checkIn({
    topicId: 'general',
    displayName: 'Invalid',
    surfaceId: 'terminal_1',
  });
  const current = visitRepository.visitById(created!.id)!;

  assert.throws(
    () =>
      visitRepository.updateVisit(current, {
        calledAt: undefined,
      } as VisitPatch),
    /INVALID_VISIT_PATCH/,
  );
  assert.throws(
    () => visitRepository.updateVisit(current, { status: undefined } as VisitPatch),
    /INVALID_VISIT_PATCH/,
  );
});

test('updateVisit: supersededByVisitId null, undefined oder leer wird abgelehnt', () => {
  const db = openDb({ path: ':memory:' });
  const runtime = createRuntime(db);
  const visitRepository = visitRepositoryFor(db);
  const created = runtime.checkIn({
    topicId: 'general',
    displayName: 'Supersede',
    surfaceId: 'terminal_1',
  });
  const current = visitRepository.visitById(created!.id)!;

  assert.throws(
    () => visitRepository.updateVisit(current, { supersededByVisitId: null } as VisitPatch),
    /INVALID_VISIT_PATCH/,
  );
  assert.throws(
    () =>
      visitRepository.updateVisit(current, {
        supersededByVisitId: undefined,
      } as VisitPatch),
    /INVALID_VISIT_PATCH/,
  );
  assert.throws(
    () => visitRepository.updateVisit(current, { supersededByVisitId: '' }),
    /INVALID_VISIT_PATCH/,
  );
  assert.throws(
    () => visitRepository.updateVisit(current, { supersededByVisitId: '   ' }),
    /INVALID_VISIT_PATCH/,
  );
});

test('visitRecordById und toVisitView: roher Visit vs angereicherte View', () => {
  const db = openDb({ path: ':memory:' });
  const catalogRepository = createCatalogRepository(db);
  const visitRepository = visitRepositoryFor(db);
  const created = createRuntime(db).checkIn({
    topicId: 'general',
    displayName: 'Enrich',
    surfaceId: 'terminal_1',
  });

  const record = visitRepository.visitRecordById(created!.id);
  assert.ok(record);
  assert.equal(record?.primaryTopicId, 'general');
  assert.equal('topic' in record!, false);

  const view = visitRepository.toVisitView(record!, catalogRepository.loadCatalog());
  assert.equal(view.topic?.id, 'general');
  assert.ok(view.journeyStepLabel);
});

test('visitById und visitRecordById: gleicher Kern, View mit Enrichment', () => {
  const db = openDb({ path: ':memory:' });
  const visitRepository = visitRepositoryFor(db);
  const created = createRuntime(db).checkIn({
    topicId: 'general',
    displayName: 'Parity',
    surfaceId: 'terminal_1',
  });

  const record = visitRepository.visitRecordById(created!.id)!;
  const view = visitRepository.visitById(created!.id)!;

  assert.equal(view.id, record.id);
  assert.equal(view.status, record.status);
  assert.equal(view.queueNumber, record.queueNumber);
  assert.ok(view.topic);
});
