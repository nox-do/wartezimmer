import type { DatabaseSync } from 'node:sqlite';
import { TERMINAL_VISIT_STATUSES } from '@praxis-flow/flow-core';
import type { JourneySettings } from '../journey-settings.js';

export function countOpenVisitsForJourneyTemplate(db: DatabaseSync, templateId: string): number {
  const terminalStatuses = [...TERMINAL_VISIT_STATUSES];
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM visits
       WHERE journey_template_id = ?
       AND journey_state = 'active'
       AND status NOT IN (${terminalStatuses.map(() => '?').join(', ')})`,
    )
    .get(templateId, ...terminalStatuses) as { count: number } | undefined;
  return Number(row?.count ?? 0);
}

export function validateJourneySettingsEditable(
  db: DatabaseSync,
  current: JourneySettings,
  next: JourneySettings,
):
  | { ok: true }
  | { ok: false; code: string; message: string; templateId: string; openVisitCount: number } {
  const currentById = new Map(current.templates.map((template) => [template.id, template]));
  const nextById = new Map(next.templates.map((template) => [template.id, template]));
  const currentStepOwners = new Map(
    current.templates.flatMap((template) =>
      template.steps.map((step) => [step.id, template.id] as const),
    ),
  );

  for (const template of next.templates) {
    for (const step of template.steps) {
      const currentOwner = currentStepOwners.get(step.id);
      if (currentOwner && currentOwner !== template.id) {
        return {
          ok: false,
          code: 'JOURNEY_STEP_ID_CONFLICT',
          message: `Journey step "${step.id}" already belongs to template "${currentOwner}".`,
          templateId: currentOwner,
          openVisitCount: countOpenVisitsForJourneyTemplate(db, currentOwner),
        };
      }
    }
  }

  for (const template of next.templates) {
    const previous = currentById.get(template.id);
    if (!previous) continue;
    if (JSON.stringify(previous) === JSON.stringify(template)) continue;

    const openVisitCount = countOpenVisitsForJourneyTemplate(db, template.id);
    if (openVisitCount > 0) {
      return {
        ok: false,
        code: 'JOURNEY_TEMPLATE_LOCKED',
        message: `Journey template "${template.id}" cannot be changed while ${openVisitCount} visit(s) are active on it.`,
        templateId: template.id,
        openVisitCount,
      };
    }
  }

  for (const template of current.templates) {
    if (nextById.has(template.id)) continue;
    const openVisitCount = countOpenVisitsForJourneyTemplate(db, template.id);
    if (openVisitCount > 0) {
      return {
        ok: false,
        code: 'JOURNEY_TEMPLATE_LOCKED',
        message: `Journey template "${template.id}" cannot be removed while ${openVisitCount} visit(s) are active on it.`,
        templateId: template.id,
        openVisitCount,
      };
    }
  }

  return { ok: true };
}
