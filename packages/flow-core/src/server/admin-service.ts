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

/**
 * Catalog-Writes für Package-Tests und Legacy-Standalone.
 * Host-Produktpfad: Katalog kommt über Ops-Settings-Sync (`syncCatalogFromOpsSettings`), nicht hier.
 */
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
      validateRoutingRuleDraft(data, { ...body, topicId: existing.topic_id } as RoutingRuleDraft, {
        ruleId: id,
      });

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
       AND journey_state = 'active'
       AND status NOT IN (${sqlIn(terminalStatuses)})`,
            )
            .get(id, ...terminalStatuses) as { count: number }
        ).count,
      );
      const data = loadCatalog();
      validateJourneyTemplateDraft(data, body);
      assertJourneyTemplateEditable({ openVisitCount });

      maybeFail('journeyTemplate:update');
      db.prepare(
        'UPDATE journey_templates SET name = ?, topic_id = ?, active = ? WHERE id = ?',
      ).run(body.name, body.topicId ?? null, body.active ? 1 : 0, id);
      const existingSteps = db
        .prepare('SELECT id, sort_order FROM journey_steps WHERE template_id = ?')
        .all(id) as Array<{ id: string; sort_order: number }>;
      const existingById = new Set(existingSteps.map((step) => step.id));
      const retainedStepIds = new Set(
        (body.steps ?? []).flatMap((step) => (step.id ? [step.id] : [])),
      );

      const upsertStep = db.prepare(
        `INSERT INTO journey_steps (
          id, template_id, sort_order, target_location_id, queue_id, movement_mode, public_display_mode, completed_when, instruction_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          template_id = excluded.template_id,
          sort_order = excluded.sort_order,
          target_location_id = excluded.target_location_id,
          queue_id = excluded.queue_id,
          movement_mode = excluded.movement_mode,
          public_display_mode = excluded.public_display_mode,
          completed_when = excluded.completed_when,
          instruction_text = excluded.instruction_text`,
      );
      const deleteStep = db.prepare('DELETE FROM journey_steps WHERE id = ?');
      const lookupAnyStep = db.prepare('SELECT template_id FROM journey_steps WHERE id = ?');

      for (const existingStep of existingSteps) {
        if (retainedStepIds.has(existingStep.id)) continue;
        maybeFail('journeyTemplate:deleteStep');
        deleteStep.run(existingStep.id);
      }

      for (const step of body.steps ?? []) {
        if (step.id && !existingById.has(step.id)) {
          const foreign = lookupAnyStep.get(step.id) as { template_id: string } | undefined;
          if (foreign?.template_id) throw new Error('JOURNEY_STEP_TEMPLATE_MISMATCH');
          throw new Error('JOURNEY_STEP_NOT_FOUND');
        }

        maybeFail(step.id ? 'journeyTemplate:updateStep' : 'journeyTemplate:insertStep');
        upsertStep.run(
          step.id ?? crypto.randomUUID(),
          id,
          step.sortOrder,
          step.targetLocationId ?? null,
          step.queueId ?? null,
          step.movementMode,
          step.publicDisplayMode,
          step.completedWhen,
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
