import test from 'node:test';
import assert from 'node:assert/strict';
import {
  openDb,
  createRuntime,
  createCatalogRepository,
  createVisitRepository,
} from '@praxis-flow/flow-core/server';
import type { VisitPatch } from '@praxis-flow/flow-core';

function readVisitRow(db: ReturnType<typeof openDb>, id: string) {
  return db.prepare('SELECT * FROM visits WHERE id = ?').get(id) as Record<string, unknown>;
}

function visitRepositoryFor(db: ReturnType<typeof openDb>) {
  const catalogRepository = createCatalogRepository(db);
  return createVisitRepository(db, catalogRepository);
}

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
