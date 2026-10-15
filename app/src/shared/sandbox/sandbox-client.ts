import { isRecord } from '../type-guards.js';
import {
  encodeIntakeFileNameHeader,
  INTAKE_FILE_NAME_ENCODING_HEADER,
} from '@wartezimmer/server-shared';

type SandboxPreviewRequest = {
  previewSessionId: string;
  documentId: string;
  mimeType: string;
};

type SandboxPreviewResponse = {
  previewSessionId: string;
  documentId: string;
  status: 'scanning' | 'ready' | 'blocked_malware' | 'render_error' | 'source_unavailable';
  previewMode?: 'interactive_pdf' | 'raster_fallback';
  embedUrl?: string;
  scannedAt?: string;
  updatedAt: string;
};

function parseSandboxPreviewResponse(payload: unknown): SandboxPreviewResponse {
  if (!isRecord(payload)) {
    throw new Error('SANDBOX_PREVIEW_FAILED:INVALID_RESPONSE_SHAPE');
  }

  const previewSessionId = payload.previewSessionId;
  const documentId = payload.documentId;
  const status = payload.status;
  const previewMode = payload.previewMode;
  const embedUrl = payload.embedUrl;
  const scannedAt = payload.scannedAt;
  const updatedAt = payload.updatedAt;

  if (
    typeof previewSessionId !== 'string' ||
    typeof documentId !== 'string' ||
    (status !== 'scanning' &&
      status !== 'ready' &&
      status !== 'blocked_malware' &&
      status !== 'render_error' &&
      status !== 'source_unavailable') ||
    typeof updatedAt !== 'string' ||
    Number.isNaN(Date.parse(updatedAt))
  ) {
    throw new Error('SANDBOX_PREVIEW_FAILED:INVALID_RESPONSE_FIELDS');
  }
  if (
    previewMode != null &&
    previewMode !== 'interactive_pdf' &&
    previewMode !== 'raster_fallback'
  ) {
    throw new Error('SANDBOX_PREVIEW_FAILED:INVALID_PREVIEW_MODE');
  }
  if (embedUrl != null && typeof embedUrl !== 'string') {
    throw new Error('SANDBOX_PREVIEW_FAILED:INVALID_EMBED_URL');
  }
  if (scannedAt != null && (typeof scannedAt !== 'string' || Number.isNaN(Date.parse(scannedAt)))) {
    throw new Error('SANDBOX_PREVIEW_FAILED:INVALID_SCANNED_AT');
  }

  return {
    previewSessionId,
    documentId,
    status,
    previewMode:
      previewMode === 'interactive_pdf' || previewMode === 'raster_fallback'
        ? previewMode
        : undefined,
    embedUrl: typeof embedUrl === 'string' ? embedUrl : undefined,
    scannedAt: typeof scannedAt === 'string' ? scannedAt : undefined,
    updatedAt,
  };
}

type SandboxFormRenderDisplay = {
  title: string;
  subtitle?: string;
  meta?: Array<{ label: string; value: string }>;
  sections: Array<{
    title: string;
    fields: Array<{ label: string; value: string }>;
  }>;
};

type SandboxFormRenderRequest = {
  documentRef: string;
  templateId: string;
  templateName: string;
  templateVersion: number;
  answers: Record<string, unknown>;
  display?: SandboxFormRenderDisplay;
};

type SandboxFormRenderResponse = {
  documentId: string;
  fileName: string;
  mimeType: 'application/pdf';
  sizeBytes: number;
  sha256: string;
  scanStatus: 'clean' | 'blocked_malware' | 'scan_error';
  scannedAt: string;
  generatedAt: string;
};

type SandboxRuntimeRestartResponse = {
  status: 'restarting';
  instanceId: string;
  initiatedAt: string;
  reason?: string;
};

function parseSandboxFormRenderResponse(payload: unknown): SandboxFormRenderResponse {
  if (!isRecord(payload)) {
    throw new Error('SANDBOX_FORM_RENDER_FAILED:INVALID_RESPONSE_SHAPE');
  }
  const body = payload;
  const fileName = body.fileName;
  const mimeType = body.mimeType;
  const sizeBytes = body.sizeBytes;
  const sha256 = body.sha256;
  const documentId = body.documentId;
  const scanStatus = body.scanStatus;
  const scannedAt = body.scannedAt;
  const generatedAt = body.generatedAt;

  if (
    typeof documentId !== 'string' ||
    typeof fileName !== 'string' ||
    typeof mimeType !== 'string' ||
    typeof sizeBytes !== 'number' ||
    !Number.isInteger(sizeBytes) ||
    sizeBytes < 1 ||
    typeof sha256 !== 'string' ||
    (scanStatus !== 'clean' && scanStatus !== 'blocked_malware' && scanStatus !== 'scan_error') ||
    typeof scannedAt !== 'string' ||
    typeof generatedAt !== 'string'
  ) {
    throw new Error('SANDBOX_FORM_RENDER_FAILED:INVALID_RESPONSE_FIELDS');
  }
  if (mimeType !== 'application/pdf') {
    throw new Error('SANDBOX_FORM_RENDER_FAILED:INVALID_MIME_TYPE');
  }
  if (!/^[a-f0-9]{64}$/i.test(sha256)) {
    throw new Error('SANDBOX_FORM_RENDER_FAILED:INVALID_SHA256');
  }
  if (Number.isNaN(Date.parse(generatedAt))) {
    throw new Error('SANDBOX_FORM_RENDER_FAILED:INVALID_GENERATED_AT');
  }

  return {
    documentId,
    fileName,
    mimeType: 'application/pdf',
    sizeBytes,
    sha256,
    scanStatus,
    scannedAt,
    generatedAt,
  };
}

function parseSandboxRuntimeRestartResponse(payload: unknown): SandboxRuntimeRestartResponse {
  if (!isRecord(payload)) {
    throw new Error('SANDBOX_RUNTIME_RESTART_FAILED:INVALID_RESPONSE_SHAPE');
  }
  const body = payload;
  const status = body.status;
  const instanceId = body.instanceId;
  const initiatedAt = body.initiatedAt;
  const reason = body.reason;

  if (status !== 'restarting') {
    throw new Error('SANDBOX_RUNTIME_RESTART_FAILED:INVALID_STATUS');
  }
  if (typeof instanceId !== 'string' || instanceId.length === 0) {
    throw new Error('SANDBOX_RUNTIME_RESTART_FAILED:INVALID_INSTANCE_ID');
  }
  if (typeof initiatedAt !== 'string' || Number.isNaN(Date.parse(initiatedAt))) {
    throw new Error('SANDBOX_RUNTIME_RESTART_FAILED:INVALID_INITIATED_AT');
  }
  if (reason != null && typeof reason !== 'string') {
    throw new Error('SANDBOX_RUNTIME_RESTART_FAILED:INVALID_REASON');
  }

  return {
    status: 'restarting',
    instanceId,
    initiatedAt,
    reason: typeof reason === 'string' ? reason : undefined,
  };
}

type SandboxIntakeResponse = {
  documentId: string;
  scanStatus: 'clean' | 'blocked_malware' | 'scan_error';
  sha256: string;
  sizeBytes: number;
  scannedAt: string;
};

function parseSandboxIntakeResponse(payload: unknown): SandboxIntakeResponse {
  if (!isRecord(payload)) {
    throw new Error('SANDBOX_INTAKE_FAILED:INVALID_RESPONSE_SHAPE');
  }
  const documentId = payload.documentId;
  const scanStatus = payload.scanStatus;
  const sha256 = payload.sha256;
  const sizeBytes = payload.sizeBytes;
  const scannedAt = payload.scannedAt;
  if (
    typeof documentId !== 'string' ||
    (scanStatus !== 'clean' && scanStatus !== 'blocked_malware' && scanStatus !== 'scan_error') ||
    typeof sha256 !== 'string' ||
    typeof sizeBytes !== 'number' ||
    !Number.isInteger(sizeBytes) ||
    typeof scannedAt !== 'string'
  ) {
    throw new Error('SANDBOX_INTAKE_FAILED:INVALID_RESPONSE_FIELDS');
  }
  return { documentId, scanStatus, sha256, sizeBytes, scannedAt };
}

export type SandboxClientTimeouts = {
  requestTimeoutMs: number;
  previewPutTimeoutMs: number;
  intakePutTimeoutMs: number;
  embedTimeoutMs: number;
};

export class SandboxClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeouts: SandboxClientTimeouts;

  constructor(baseUrl: string, token: string, timeouts: SandboxClientTimeouts) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
    this.timeouts = timeouts;
  }

  private requestHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (this.token.length > 0) {
      headers['x-internal-service-token'] = this.token;
    }
    return headers;
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number = this.timeouts.requestTimeoutMs,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async getPreviewSession(previewSessionId: string): Promise<SandboxPreviewResponse | null> {
    let response: Response;
    try {
      response = await this.fetchWithTimeout(
        `${this.baseUrl}/internal/preview/sessions/${encodeURIComponent(previewSessionId)}`,
        {
          method: 'GET',
          headers: this.requestHeaders(),
        },
      );
    } catch (error) {
      throw new Error('SANDBOX_PREVIEW_UNREACHABLE', {
        cause: error,
      });
    }

    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`SANDBOX_PREVIEW_REQUEST_FAILED:${response.status}`);
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch (error) {
      throw new Error('SANDBOX_PREVIEW_FAILED:INVALID_JSON', { cause: error });
    }
    return parseSandboxPreviewResponse(parsed);
  }

  async putPreviewSessionDocument(input: SandboxPreviewRequest): Promise<SandboxPreviewResponse> {
    let response: Response;
    try {
      response = await this.fetchWithTimeout(
        `${this.baseUrl}/internal/preview/sessions/${encodeURIComponent(input.previewSessionId)}/document`,
        {
          method: 'PUT',
          headers: this.requestHeaders(),
          body: JSON.stringify({
            documentRef: input.documentId,
            mimeType: input.mimeType,
          }),
        },
        this.timeouts.previewPutTimeoutMs,
      );
    } catch (error) {
      throw new Error('SANDBOX_PREVIEW_UNREACHABLE', {
        cause: error,
      });
    }

    if (!response.ok) {
      throw new Error(`SANDBOX_PREVIEW_REQUEST_FAILED:${response.status}`);
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch (error) {
      throw new Error('SANDBOX_PREVIEW_FAILED:INVALID_JSON', { cause: error });
    }
    return parseSandboxPreviewResponse(parsed);
  }

  async ensurePreviewSessionDocument(
    input: SandboxPreviewRequest,
    options: { allowCached?: boolean } = {},
  ): Promise<SandboxPreviewResponse> {
    if (options.allowCached) {
      const cached = await this.getPreviewSession(input.previewSessionId);
      if (cached?.status === 'ready' && cached.documentId === input.documentId) {
        return cached;
      }
    }
    return this.putPreviewSessionDocument(input);
  }

  async clearPreviewSessionDocument(previewSessionId: string): Promise<void> {
    let response: Response;
    try {
      response = await this.fetchWithTimeout(
        `${this.baseUrl}/internal/preview/sessions/${encodeURIComponent(previewSessionId)}/document`,
        {
          method: 'DELETE',
          headers: this.requestHeaders(),
        },
      );
    } catch (error) {
      throw new Error('SANDBOX_PREVIEW_UNREACHABLE', {
        cause: error,
      });
    }
    if (!response.ok && response.status !== 404) {
      throw new Error(`SANDBOX_PREVIEW_CLEAR_FAILED:${response.status}`);
    }
  }

  async fetchPreviewEmbed(
    previewSessionId: string,
    options: { raw?: boolean } = {},
  ): Promise<Response> {
    const params = new URLSearchParams();
    if (options.raw) {
      params.set('raw', '1');
    }
    const query = params.size > 0 ? `?${params.toString()}` : '';
    try {
      return await this.fetchWithTimeout(
        `${this.baseUrl}/internal/preview/embed/${encodeURIComponent(previewSessionId)}${query}`,
        {
          method: 'GET',
          headers: this.requestHeaders(),
        },
        this.timeouts.embedTimeoutMs,
      );
    } catch (error) {
      throw new Error('SANDBOX_PREVIEW_UNREACHABLE', {
        cause: error,
      });
    }
  }

  async renderFormPdf(input: SandboxFormRenderRequest): Promise<SandboxFormRenderResponse> {
    let response: Response;
    try {
      response = await this.fetchWithTimeout(
        `${this.baseUrl}/internal/form2pdf/render`,
        {
          method: 'POST',
          headers: this.requestHeaders(),
          body: JSON.stringify(input),
        },
        this.timeouts.intakePutTimeoutMs,
      );
    } catch (error) {
      throw new Error('SANDBOX_FORM_RENDER_UNREACHABLE', {
        cause: error,
      });
    }

    if (!response.ok) {
      throw new Error(`SANDBOX_FORM_RENDER_FAILED:${response.status}`);
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch (error) {
      throw new Error('SANDBOX_FORM_RENDER_FAILED:INVALID_JSON', { cause: error });
    }
    return parseSandboxFormRenderResponse(parsed);
  }

  async putDocumentIntake(
    documentId: string,
    body: Buffer,
    meta: { fileName: string; mimeType: string },
  ): Promise<SandboxIntakeResponse> {
    const fileNameHeader = encodeIntakeFileNameHeader(meta.fileName);
    let response: Response;
    try {
      response = await this.fetchWithTimeout(
        `${this.baseUrl}/internal/documents/${encodeURIComponent(documentId)}/intake`,
        {
          method: 'PUT',
          headers: {
            ...(this.token.length > 0 ? { 'x-internal-service-token': this.token } : {}),
            'content-type': 'application/octet-stream',
            'content-length': String(body.length),
            'x-file-name': fileNameHeader.value,
            [INTAKE_FILE_NAME_ENCODING_HEADER]: fileNameHeader.encoding,
            'x-mime-type': meta.mimeType,
          },
          body: new Uint8Array(body),
        },
        this.timeouts.intakePutTimeoutMs,
      );
    } catch (error) {
      throw new Error('SANDBOX_INTAKE_UNREACHABLE', { cause: error });
    }

    if (!response.ok) {
      throw new Error(`SANDBOX_INTAKE_FAILED:${response.status}`);
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch (error) {
      throw new Error('SANDBOX_INTAKE_FAILED:INVALID_JSON', { cause: error });
    }
    return parseSandboxIntakeResponse(parsed);
  }

  async getDocumentContent(documentId: string): Promise<Response> {
    try {
      return await this.fetchWithTimeout(
        `${this.baseUrl}/internal/documents/${encodeURIComponent(documentId)}/content`,
        {
          method: 'GET',
          headers: this.token.length > 0 ? { 'x-internal-service-token': this.token } : {},
        },
        this.timeouts.embedTimeoutMs,
      );
    } catch (error) {
      throw new Error('SANDBOX_CONTENT_UNREACHABLE', { cause: error });
    }
  }

  async deleteDocument(documentId: string): Promise<void> {
    let response: Response;
    try {
      response = await this.fetchWithTimeout(
        `${this.baseUrl}/internal/documents/${encodeURIComponent(documentId)}`,
        {
          method: 'DELETE',
          headers: this.token.length > 0 ? { 'x-internal-service-token': this.token } : {},
        },
      );
    } catch (error) {
      throw new Error('SANDBOX_DELETE_UNREACHABLE', { cause: error });
    }
    if (!response.ok && response.status !== 404) {
      throw new Error(`SANDBOX_DELETE_FAILED:${response.status}`);
    }
  }

  async purgeIntakeDay(reason?: string): Promise<void> {
    let response: Response;
    try {
      response = await this.fetchWithTimeout(`${this.baseUrl}/internal/documents/purge-day`, {
        method: 'POST',
        headers: this.requestHeaders(),
        body: JSON.stringify({ reason }),
      });
    } catch (error) {
      throw new Error('SANDBOX_PURGE_UNREACHABLE', { cause: error });
    }
    if (!response.ok) {
      throw new Error(`SANDBOX_PURGE_FAILED:${response.status}`);
    }
  }

  async getRuntimeInstanceId(): Promise<string> {
    let response: Response;
    try {
      response = await this.fetchWithTimeout(`${this.baseUrl}/internal/health/live`, {
        method: 'GET',
      });
    } catch (error) {
      throw new Error('SANDBOX_HEALTH_UNREACHABLE', { cause: error });
    }
    if (!response.ok) {
      throw new Error(`SANDBOX_HEALTH_FAILED:${response.status}`);
    }
    const payload: unknown = await response.json().catch((error: unknown) => {
      throw new Error('SANDBOX_HEALTH_FAILED:INVALID_JSON', { cause: error });
    });
    if (!isRecord(payload) || typeof payload.instanceId !== 'string' || !payload.instanceId) {
      throw new Error('SANDBOX_HEALTH_FAILED:INVALID_INSTANCE_ID');
    }
    return payload.instanceId;
  }

  async requestRuntimeRestart(reason: string): Promise<SandboxRuntimeRestartResponse> {
    let response: Response;
    try {
      response = await this.fetchWithTimeout(`${this.baseUrl}/internal/runtime/restart`, {
        method: 'POST',
        headers: this.requestHeaders(),
        body: JSON.stringify({ reason }),
      });
    } catch (error) {
      throw new Error('SANDBOX_RUNTIME_RESTART_UNREACHABLE', {
        cause: error,
      });
    }

    if (!response.ok) {
      throw new Error(`SANDBOX_RUNTIME_RESTART_FAILED:${response.status}`);
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch (error) {
      throw new Error('SANDBOX_RUNTIME_RESTART_FAILED:INVALID_JSON', { cause: error });
    }
    return parseSandboxRuntimeRestartResponse(parsed);
  }
}

let sandboxClient: SandboxClient | null = null;

function readPositiveTimeoutMs(envKey: string, fallbackMs: number): number {
  const parsed = Number.parseInt(process.env[envKey] ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallbackMs;
}

export function getSandboxClient(): SandboxClient {
  if (!sandboxClient) {
    const baseUrl = process.env.SANDBOX_BASE_URL ?? 'http://127.0.0.1:8081';
    const token = process.env.SANDBOX_INTERNAL_TOKEN?.trim() ?? '';
    const requestTimeoutMs = readPositiveTimeoutMs('SANDBOX_REQUEST_TIMEOUT_MS', 7000);
    const scanTimeoutMs = readPositiveTimeoutMs('SANDBOX_SCAN_TIMEOUT_MS', 20000);
    const previewPutTimeoutMs = readPositiveTimeoutMs(
      'SANDBOX_PREVIEW_PUT_TIMEOUT_MS',
      Math.max(45_000, scanTimeoutMs + 10_000),
    );
    const intakePutTimeoutMs = readPositiveTimeoutMs(
      'SANDBOX_INTAKE_PUT_TIMEOUT_MS',
      Math.max(45_000, scanTimeoutMs + 10_000),
    );
    const embedTimeoutMs = readPositiveTimeoutMs('SANDBOX_EMBED_TIMEOUT_MS', 120_000);
    const explicitSandboxAuthEnabled = process.env.SANDBOX_AUTH_ENABLED?.trim();
    const nodeEnv = process.env.NODE_ENV ?? 'development';
    const sandboxAuthEnabled = explicitSandboxAuthEnabled
      ? explicitSandboxAuthEnabled === 'true'
      : nodeEnv !== 'development';
    if (token.length === 0 && sandboxAuthEnabled) {
      throw new Error('SANDBOX_INTERNAL_TOKEN is required');
    }
    sandboxClient = new SandboxClient(baseUrl, token, {
      requestTimeoutMs,
      previewPutTimeoutMs,
      intakePutTimeoutMs,
      embedTimeoutMs,
    });
  }

  return sandboxClient;
}
