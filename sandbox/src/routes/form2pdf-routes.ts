import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { sanitizeSegment } from '../document-paths.js';
import { buildFormPdf } from '../form2pdf-layout.js';
import { buildSimplePdf } from '../form2pdf-pdf.js';
import { isFormPdfDisplay } from '../form2pdf-types.js';
import { processIntakeDocument } from '../intake-document.js';
import { IntakeStore } from '../intake-store.js';
import type { SandboxConfig } from '../sandbox-config.js';
import type { ScannerService } from '../scanner-service.js';
import { logIntakeScanOutcome } from '../intake-scan-log.js';

export function registerForm2PdfRoutes(
  app: FastifyInstance,
  config: Pick<SandboxConfig, 'intakeBasePath'>,
  scanner: ScannerService,
): void {
  const intakeStore = new IntakeStore(config.intakeBasePath);

  app.post<{
    Body: {
      documentRef?: string;
      templateId?: string;
      templateName?: string;
      templateVersion?: number;
      answers?: Record<string, unknown>;
      display?: unknown;
    };
  }>('/internal/form2pdf/render', async (request, reply) => {
    const documentRef = request.body.documentRef?.trim() ?? '';
    const templateId = request.body.templateId?.trim() ?? '';
    const templateName = request.body.templateName?.trim() ?? '';
    const templateVersion = request.body.templateVersion;
    const answers = request.body.answers;

    if (
      !documentRef ||
      !templateId ||
      !templateName ||
      !Number.isInteger(templateVersion) ||
      !answers ||
      typeof answers !== 'object'
    ) {
      return reply.code(400).send({
        code: 'SANDBOX_INVALID_ARGUMENT',
        message: 'documentRef, templateId, templateName, templateVersion and answers are required.',
      });
    }

    const generatedAt = new Date().toISOString();
    const display = request.body.display;
    const pdfBuffer = isFormPdfDisplay(display)
      ? buildFormPdf(display)
      : buildSimplePdf([
          `Anamnese Template: ${templateName}`,
          `Template ID: ${templateId}`,
          `Template Version: v${templateVersion}`,
          `Generated At: ${generatedAt}`,
          '',
          'Antworten:',
          ...Object.entries(answers)
            .slice(0, 200)
            .map(([key, value]) => {
              const printable = typeof value === 'string' ? value : JSON.stringify(value);
              return `- ${key}: ${printable ?? ''}`;
            }),
        ]);
    const fileName = `${sanitizeSegment(templateId)}-v${templateVersion}-${randomUUID().slice(0, 8)}.pdf`;

    try {
      const intake = await processIntakeDocument(intakeStore, scanner, {
        documentId: documentRef,
        fileName,
        mimeType: 'application/pdf',
        buffer: pdfBuffer,
      });
      logIntakeScanOutcome(request.log, intake, 'form2pdf');

      return {
        documentId: intake.documentId,
        fileName: intake.fileName,
        mimeType: intake.mimeType,
        sizeBytes: intake.sizeBytes,
        sha256: intake.sha256,
        scanStatus: intake.scanStatus,
        scannedAt: intake.scannedAt,
        generatedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
      if (message.includes('EEXIST')) {
        return reply.code(409).send({
          code: 'SANDBOX_INTAKE_EXISTS',
          message: 'Document intake already exists.',
        });
      }
      throw error;
    }
  });
}
