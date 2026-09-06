import { createModuleLogger } from '@praxis-flow/server-shared/logger';
import type { CoreDatabase, OutboxEventRow } from '../db/database.js';
import { domainError } from '../errors/domain-error.js';

type OutboxWorkerOptions = {
  pollIntervalMs: number;
  batchSize: number;
  maxAttempts: number;
  retryBaseMs: number;
  claimLeaseMs: number;
};

const log = createModuleLogger('outbox.worker');

/** v1: all emitted outbox events are audit-only; no async side-effect handlers. */
export const AUDIT_ONLY_EVENT_TYPES = new Set([
  'CheckinCreated',
  'QueueStatusChanged',
  'DayCloseStarted',
  'BusinessDayReset',
  'DocumentIntakeReceived',
  'DocumentPreviewRequested',
  'DocumentLifecycleChanged',
  'DocumentRenamed',
  'OpsRuntimeReset',
  'EmergencyRaised',
  'EmergencyAcknowledged',
  'PatientSessionClosed',
  'VisitSuperseded',
]);

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function readOutboxWorkerOptionsFromEnv(): OutboxWorkerOptions {
  return {
    pollIntervalMs: readPositiveIntEnv('OUTBOX_POLL_INTERVAL_MS', 2000),
    batchSize: readPositiveIntEnv('OUTBOX_BATCH_SIZE', 25),
    maxAttempts: readPositiveIntEnv('OUTBOX_MAX_ATTEMPTS', 5),
    retryBaseMs: readPositiveIntEnv('OUTBOX_RETRY_BASE_MS', 1000),
    claimLeaseMs: readPositiveIntEnv('OUTBOX_CLAIM_LEASE_MS', 15000),
  };
}

export class OutboxWorker {
  private readonly db: CoreDatabase;
  private readonly options: OutboxWorkerOptions;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(db: CoreDatabase, options: OutboxWorkerOptions) {
    this.db = db;
    this.options = options;
  }

  start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, this.options.pollIntervalMs);
    this.timer.unref();
    void this.tick();
    log.info(
      {
        pollIntervalMs: this.options.pollIntervalMs,
        batchSize: this.options.batchSize,
        maxAttempts: this.options.maxAttempts,
        retryBaseMs: this.options.retryBaseMs,
        claimLeaseMs: this.options.claimLeaseMs,
      },
      'Outbox worker started',
    );
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    log.info('Outbox worker stopped');
  }

  private async tick(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;

    try {
      const pending = this.db.claimPendingOutboxEvents(
        this.options.batchSize,
        this.options.claimLeaseMs,
      );
      for (const event of pending) {
        await this.processEvent(event);
      }
    } catch (error) {
      log.error(
        { error: error instanceof Error ? error.message : 'UNKNOWN_ERROR' },
        'Outbox tick failed',
      );
    } finally {
      this.running = false;
    }
  }

  private async processEvent(event: OutboxEventRow): Promise<void> {
    try {
      await this.dispatch(event);
      this.db.markOutboxPublished(event.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
      const attemptsAfterFailure = event.attemptCount + 1;

      if (attemptsAfterFailure >= this.options.maxAttempts) {
        this.db.markOutboxDeadLetter(event.id, message);
        const deadLetterMeta = {
          eventId: event.id,
          eventType: event.eventType,
          attemptsAfterFailure,
          error: message,
        };
        if (AUDIT_ONLY_EVENT_TYPES.has(event.eventType)) {
          log.debug(deadLetterMeta, 'Outbox audit event dead-lettered');
        } else {
          log.error(deadLetterMeta, 'Outbox event dead-lettered');
        }
        return;
      }

      const retryDelayMs = this.options.retryBaseMs * 2 ** Math.max(0, attemptsAfterFailure - 1);
      const nextAttemptAt = new Date(Date.now() + retryDelayMs).toISOString();
      this.db.markOutboxRetry(event.id, nextAttemptAt, message);
      const retryMeta = {
        eventId: event.id,
        eventType: event.eventType,
        attemptsAfterFailure,
        nextAttemptAt,
        error: message,
      };
      if (AUDIT_ONLY_EVENT_TYPES.has(event.eventType)) {
        log.debug(retryMeta, 'Outbox audit event retry scheduled');
      } else {
        log.warn(retryMeta, 'Outbox event retry scheduled');
      }
    }
  }

  private async dispatch(event: OutboxEventRow): Promise<void> {
    if (AUDIT_ONLY_EVENT_TYPES.has(event.eventType)) {
      return;
    }

    throw domainError(`OUTBOX_UNSUPPORTED_EVENT_TYPE:${event.eventType}`);
  }
}
