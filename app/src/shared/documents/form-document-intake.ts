import { randomUUID } from 'node:crypto';
import type { CoreDatabase } from '../db/database.js';
import type { PatientDocumentRow } from '../db/db-types.js';
import { buildFormPdfDisplay, type FormPdfDisplay } from '../forms/form-pdf-display.js';
import { mergeFormAnswersWithSessionPhone } from '../forms/merge-form-session-phone.js';
import {
  getFormTemplate,
  validateFormAnswers,
  type FormTemplateDefinition,
} from '../forms/template-registry.js';
import { formatTicketCode } from '../queue/ticket-code.js';
import { isRecord } from '../type-guards.js';
import { mapSandboxIntakeScanStatus } from './document-status-rules.js';
import { purgeSandboxDocumentBestEffort } from './sandbox-document-cleanup.js';
import { getSandboxClient } from '../sandbox/sandbox-client.js';
import { domainError } from '../errors/domain-error.js';

export type PatientFormDocumentItem = {
  templateId: string;
  templateVersion: number;
  answers?: Record<string, unknown>;
};

export type PreparedFormDocumentRender = {
  documentId: string;
  templateId: string;
  templateVersion: number;
  templateName: string;
  answers: Record<string, unknown>;
  display: FormPdfDisplay;
};

export function normalizeFormTemplateId(value: string | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized.length > 0 ? normalized : null;
}

type FormBatchContext = {
  sessionToken: string;
  submittedAt: string;
  ticketCode: string;
  laneCode: string;
  ticketNumber: number;
  checkinPhone: string | null;
  primaryQuestionnaire: {
    template: FormTemplateDefinition;
    answers: Record<string, unknown>;
  } | null;
};

function prepareFormDocument(
  item: PatientFormDocumentItem,
  context: FormBatchContext,
): PreparedFormDocumentRender {
  const templateId = normalizeFormTemplateId(item.templateId);
  if (!templateId) {
    throw domainError('FORM_TEMPLATE_ID_REQUIRED');
  }
  if (!Number.isInteger(item.templateVersion) || item.templateVersion < 1) {
    throw domainError('FORM_TEMPLATE_VERSION_INVALID');
  }

  const template = getFormTemplate(templateId, item.templateVersion);
  if (!template) {
    throw domainError('FORM_TEMPLATE_NOT_FOUND');
  }

  const answers = item.answers ?? {};
  if (!isRecord(answers)) {
    throw domainError('FORM_ANSWERS_INVALID');
  }

  if (template.formKind === 'consent') {
    if (template.requiresQuestionnaireInBatch && !context.primaryQuestionnaire) {
      throw domainError('FORM_CONSENT_REQUIRES_PRIMARY');
    }
    if (answers.einwilligung !== true) {
      throw domainError('FORM_CONSENT_REQUIRED');
    }
  } else {
    const mergedAnswers = mergeFormAnswersWithSessionPhone(answers, context.checkinPhone);
    const validationErrors = validateFormAnswers(template, mergedAnswers);
    if (validationErrors.length > 0) {
      throw domainError('FORM_ANSWERS_VALIDATION_FAILED');
    }
    context.primaryQuestionnaire = { template, answers: mergedAnswers };
    return {
      documentId: randomUUID(),
      templateId: template.id,
      templateVersion: template.version,
      templateName: template.name,
      answers: mergedAnswers,
      display: buildFormPdfDisplay({
        template,
        answers: mergedAnswers,
        batch: {
          ticketCode: context.ticketCode,
          laneCode: context.laneCode,
          ticketNumber: context.ticketNumber,
          submittedAt: context.submittedAt,
          checkinPhone: context.checkinPhone,
          primaryQuestionnaire: context.primaryQuestionnaire,
        },
      }),
    };
  }

  return {
    documentId: randomUUID(),
    templateId: template.id,
    templateVersion: template.version,
    templateName: template.name,
    answers,
    display: buildFormPdfDisplay({
      template,
      answers,
      batch: {
        ticketCode: context.ticketCode,
        laneCode: context.laneCode,
        ticketNumber: context.ticketNumber,
        submittedAt: context.submittedAt,
        checkinPhone: context.checkinPhone,
        primaryQuestionnaire: context.primaryQuestionnaire ?? undefined,
      },
    }),
  };
}

export function prepareFormDocumentBatch(
  db: CoreDatabase,
  sessionToken: string,
  items: PatientFormDocumentItem[],
): PreparedFormDocumentRender[] {
  if (items.length < 1 || items.length > 8) {
    throw domainError('FORM_BATCH_SIZE_INVALID');
  }

  const sessionMe = db.getPatientSessionMe(sessionToken);
  const ticket = db.getVisitIdentityView(sessionMe.visitId);
  const context: FormBatchContext = {
    sessionToken,
    submittedAt: new Date().toISOString(),
    ticketCode: formatTicketCode(ticket.laneCode, ticket.number),
    laneCode: ticket.laneCode,
    ticketNumber: ticket.number,
    checkinPhone: sessionMe.checkinPhone,
    primaryQuestionnaire: null,
  };

  const sortedItems = [...items].sort((left, right) => {
    const leftTemplate = getFormTemplate(left.templateId, left.templateVersion);
    const rightTemplate = getFormTemplate(right.templateId, right.templateVersion);
    const leftIsConsent = leftTemplate?.formKind === 'consent';
    const rightIsConsent = rightTemplate?.formKind === 'consent';
    if (leftIsConsent === rightIsConsent) {
      return 0;
    }
    return leftIsConsent ? 1 : -1;
  });

  return sortedItems.map((item) => prepareFormDocument(item, context));
}

type RenderedFormDocument = {
  prepared: PreparedFormDocumentRender;
  render: Awaited<ReturnType<ReturnType<typeof getSandboxClient>['renderFormPdf']>>;
  status: ReturnType<typeof mapSandboxIntakeScanStatus>;
};

export async function renderFormDocuments(
  items: PreparedFormDocumentRender[],
): Promise<RenderedFormDocument[]> {
  const sandbox = getSandboxClient();
  const settled = await Promise.allSettled(
    items.map(async (prepared) => {
      const render = await sandbox.renderFormPdf({
        documentRef: prepared.documentId,
        templateId: prepared.templateId,
        templateName: prepared.templateName,
        templateVersion: prepared.templateVersion,
        answers: prepared.answers,
        display: prepared.display,
      });
      return {
        prepared,
        render,
        status: mapSandboxIntakeScanStatus(render.scanStatus),
      };
    }),
  );

  const rendered: RenderedFormDocument[] = [];
  for (const [index, outcome] of settled.entries()) {
    if (outcome.status === 'fulfilled') {
      rendered.push(outcome.value);
      continue;
    }

    await rollbackRenderedFormDocuments(rendered);
    const failedPrepared = items[index];
    if (failedPrepared) {
      await purgeSandboxDocumentBestEffort(failedPrepared.documentId);
    }
    throw outcome.reason;
  }

  return rendered;
}

export function assertAllFormDocumentsScanClean(rendered: RenderedFormDocument[]): void {
  const blocked = rendered.find((entry) => entry.status !== 'scan_clean');
  if (blocked) {
    throw domainError(`FORM_DOCUMENT_SCAN_${blocked.status.toUpperCase()}`);
  }
}

export async function persistFormDocuments(
  db: CoreDatabase,
  sessionToken: string,
  rendered: RenderedFormDocument[],
): Promise<PatientDocumentRow[]> {
  return db.intakeFormDocuments(
    sessionToken,
    rendered.map((entry) => ({
      source: 'form',
      documentId: entry.prepared.documentId,
      fileName: entry.render.fileName,
      mimeType: entry.render.mimeType,
      sizeBytes: entry.render.sizeBytes,
      status: entry.status,
      templateId: entry.prepared.templateId,
      templateVersion: entry.prepared.templateVersion,
    })),
  );
}

export async function rollbackRenderedFormDocuments(
  rendered: RenderedFormDocument[],
): Promise<void> {
  await Promise.all(
    rendered.map((entry) => purgeSandboxDocumentBestEffort(entry.prepared.documentId)),
  );
}

export type { RenderedFormDocument };

export async function intakePatientFormDocuments(
  db: CoreDatabase,
  sessionToken: string,
  items: PatientFormDocumentItem[],
): Promise<PatientDocumentRow[]> {
  const prepared = prepareFormDocumentBatch(db, sessionToken, items);
  const rendered = await renderFormDocuments(prepared);
  try {
    assertAllFormDocumentsScanClean(rendered);
  } catch (error) {
    await rollbackRenderedFormDocuments(rendered);
    throw error;
  }
  try {
    return await persistFormDocuments(db, sessionToken, rendered);
  } catch (error) {
    await rollbackRenderedFormDocuments(rendered);
    throw error;
  }
}
