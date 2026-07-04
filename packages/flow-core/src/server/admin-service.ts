import type { DatabaseSync } from 'node:sqlite';
import {
  assertJourneyTemplateEditable,
  assertTopicEditable,
  parseSaveRuleBody,
  parseSaveTopicBody,
  TERMINAL_VISIT_STATUSES,
  validateJourneyTemplateDraft,
  validateRoutingRuleDraft,
  validateTopicDraft,
  type JourneyTemplateDraft,
  type RoutingRuleDraft,
} from '@praxis-flow/flow-core';
import type { CatalogRepository } from './catalog-repository.js';
import { runInTransaction } from './unit-of-work.js';

function sqlIn(values: readonly string[]): string {
  return values.map(() => '?').join(', ');
}

type SaveRuleBody = ReturnType<typeof parseSaveRuleBody>;
type SaveTopicBody = ReturnType<typeof parseSaveTopicBody>;

export function createAdminService(params: {
  db: DatabaseSync;
  catalogRepository: CatalogRepository;
  maybeFail: (label: string) => void;
}) {
  const { db, catalogRepository, maybeFail } = params;
  const { loadCatalog, stepsForTemplate, serializeAllowedSurfaceIds } = catalogRepository;

  const saveRule = (id: string, body: SaveRuleBody) =>
    runInTransaction(db, () => {
      const existing = db.prepare('SELECT id, topic_id FROM routing_rules WHERE id = ?').get(id) as
        | { id: string; topic_id: string }
        | undefined;
      if (!existing) throw new Error('ROUTING_RULE_NOT_FOUND');
      if (body.topicId && body.topicId !== existing.topic_id) {
        throw new Error('ROUTING_RULE_TOPIC_IMMUTABLE');
      }

      const data = loadCatalog();
      validateRoutingRuleDraft(data, { ...body, topicId: existing.topic_id } as RoutingRuleDraft, { ruleId: id });

      db.prepare(
        `UPDATE routing_rules SET
        initial_last_known_location_id = ?, initial_target_location_id = ?, initial_queue_id = ?,
        initial_movement_mode = ?, initial_location_confidence = ?, public_display_mode = ?,
        terminal_instruction_template = ?, requires_reception_confirmation = ?, escort_policy = ?,
        allow_redirect = ?, allowed_surface_ids = ?, journey_template_id = ?, active = ?
       WHERE id = ?`,
      ).run(
        body.initialLastKnownLocationId ?? null,
        body.initialTargetLocationId ?? null,
        body.initialQueueId ?? null,
        body.initialMovementMode,
        body.initialLocationConfidence ?? 'instructed',
        body.publicDisplayMode,
        body.terminalInstructionTemplate,
        body.requiresReceptionConfirmation ? 1 : 0,
        body.escortPolicy,
        (body.allowRedirect ?? true) ? 1 : 0,
        serializeAllowedSurfaceIds(body.allowedSurfaceIds),
        body.journeyTemplateId ?? null,
        body.active ? 1 : 0,
        id,
      );
      return loadCatalog().routingRules.find((item) => item.id === id);
    });

  const saveJourneyTemplate = (id: string, body: JourneyTemplateDraft) =>
    runInTransaction(db, () => {
      const existing = db.prepare('SELECT id FROM journey_templates WHERE id = ?').get(id);
      if (!existing) throw new Error('JOURNEY_TEMPLATE_NOT_FOUND');

      const terminalStatuses = [...TERMINAL_VISIT_STATUSES];
      const openVisitCount = Number(
        (
          db
            .prepare(
              `SELECT COUNT(*) AS count FROM visits
       WHERE journey_template_id = ?
       AND status NOT IN (${sqlIn(terminalStatuses)})`,
            )
            .get(id, ...terminalStatuses) as { count: number }
        ).count,
      );
      const data = loadCatalog();
      validateJourneyTemplateDraft(data, body);
      assertJourneyTemplateEditable({ openVisitCount });

      maybeFail('journeyTemplate:update');
      db.prepare('UPDATE journey_templates SET name = ?, topic_id = ?, active = ? WHERE id = ?').run(
        body.name,
        body.topicId ?? null,
        body.active ? 1 : 0,
        id,
      );
      maybeFail('journeyTemplate:deleteSteps');
      db.prepare('DELETE FROM journey_steps WHERE template_id = ?').run(id);

      const insert = db.prepare('INSERT INTO journey_steps VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      for (const step of body.steps ?? []) {
        maybeFail('journeyTemplate:insertStep');
        insert.run(
          crypto.randomUUID(),
          id,
          step.sortOrder,
          step.targetLocationId ?? null,
          step.queueId ?? null,
          step.movementMode,
          step.publicDisplayMode,
          step.advanceOn,
          step.instructionText ?? null,
        );
      }

      const saved = loadCatalog();
      return {
        template: saved.journeyTemplates.find((item) => item.id === id),
        steps: stepsForTemplate(id, saved.journeySteps),
      };
    });

  const saveTopic = (id: string, body: SaveTopicBody) =>
    runInTransaction(db, () => {
      const existing = db.prepare('SELECT id FROM topics WHERE id = ?').get(id);
      if (!existing) throw new Error('TOPIC_NOT_FOUND');

      const terminalStatuses = [...TERMINAL_VISIT_STATUSES];
      const openVisitCount = Number(
        (
          db
            .prepare(
              `SELECT COUNT(*) AS count FROM visits
       WHERE primary_topic_id = ?
       AND status NOT IN (${sqlIn(terminalStatuses)})`,
            )
            .get(id, ...terminalStatuses) as { count: number }
        ).count,
      );

      const data = loadCatalog();
      validateTopicDraft(data, body, { topicId: id });
      assertTopicEditable({ openVisitCount });

      maybeFail('topic:update');
      db.prepare(
        `UPDATE topics SET
        name = ?, category = ?, color = ?, default_priority = ?,
        estimated_duration_min = ?, active = ?, sort_order = ?, lane_code = ?
       WHERE id = ?`,
      ).run(
        body.name,
        body.category,
        body.color,
        body.defaultPriority,
        body.estimatedDurationMin ?? null,
        body.active ? 1 : 0,
        body.sortOrder,
        body.laneCode,
        id,
      );

      return loadCatalog().topics.find((item) => item.id === id);
    });

  return { saveRule, saveJourneyTemplate, saveTopic };
}

export type AdminService = ReturnType<typeof createAdminService>;
