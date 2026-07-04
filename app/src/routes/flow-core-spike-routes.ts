import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  httpStatusForError,
  parseCheckInBody,
  parseTransitionAction,
  parseTransitionBody,
} from '@praxis-flow/flow-core';
import type { CoreDatabase } from '../shared/db/database.js';
import {
  flowCoreSpikeHealth,
  getFlowCoreSpikeRuntime,
  isFlowCoreSpikeEnabled,
  syncFlowCoreSpikeCatalog,
} from '../shared/flow-core/flow-core-spike-runtime.js';
import {
  buildFlowCoreTvSnapshot,
  mapFlowCoreVisitSummary,
} from '../shared/flow-core/flow-core-spike-snapshot.js';
import {
  PF_FLOW_SURFACE_TERMINAL,
} from '../shared/flow-core/sync-catalog-from-ops-settings.js';

function resolveSpikeSurfaceId(surfaceId: string): string {
  return surfaceId === 'terminal_1' ? PF_FLOW_SURFACE_TERMINAL : surfaceId;
}

function sendFlowCoreError(reply: FastifyReply, error: unknown): void {
  const code = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
  void reply.code(httpStatusForError(error)).send({
    code,
    message: code,
  });
}

export function registerFlowCoreSpikeRoutes(app: FastifyInstance, db: CoreDatabase): void {
  if (!isFlowCoreSpikeEnabled()) {
    return;
  }

  app.get('/api/v1/dev/flow-core/health', async (_request, reply) => {
    return reply.send(flowCoreSpikeHealth());
  });

  app.post('/api/v1/dev/flow-core/sync-catalog', async (_request, reply) => {
    const settings = db.getOpsSettings();
    const summary = syncFlowCoreSpikeCatalog(settings);
    return reply.send({
      synced: true,
      summary,
      businessDay: flowCoreSpikeHealth().businessDay,
    });
  });

  app.get('/api/v1/dev/flow-core/catalog', async (_request, reply) => {
    const runtime = getFlowCoreSpikeRuntime();
    const catalog = runtime.catalog();
    return reply.send({
      businessDay: flowCoreSpikeHealth().businessDay,
      topicCount: catalog.topics.length,
      locationCount: catalog.locations.length,
      queueCount: catalog.queues.length,
      surfaceCount: catalog.surfaces.length,
      routingRuleCount: catalog.routingRules.length,
      displayRuleCount: catalog.surfaceDisplayRules.length,
      topics: catalog.topics.map((topic) => ({
        id: topic.id,
        name: topic.name,
        laneCode: topic.laneCode,
        active: topic.active,
      })),
      routingRules: catalog.routingRules.map((rule) => ({
        id: rule.id,
        topicId: rule.topicId,
        targetLocationId: rule.initialTargetLocationId,
        queueId: rule.initialQueueId,
        movementMode: rule.initialMovementMode,
      })),
    });
  });

  app.get('/api/v1/dev/flow-core/visits', async (_request, reply) => {
    const runtime = getFlowCoreSpikeRuntime();
    return reply.send({
      businessDay: flowCoreSpikeHealth().businessDay,
      visitCount: runtime.visits().length,
      visits: runtime.visits().map((visit) => mapFlowCoreVisitSummary(visit)),
    });
  });

  app.post('/api/v1/dev/flow-core/check-in', async (request, reply) => {
    try {
      const parsed = parseCheckInBody(request.body);
      const visit = getFlowCoreSpikeRuntime().checkIn({
        ...parsed,
        surfaceId: resolveSpikeSurfaceId(parsed.surfaceId),
      });
      if (!visit) {
        return reply.code(500).send({
          code: 'INTERNAL_ERROR',
          message: 'Check-in returned no visit.',
        });
      }
      return reply.send(mapFlowCoreVisitSummary(visit));
    } catch (error) {
      return sendFlowCoreError(reply, error);
    }
  });

  app.post('/api/v1/dev/flow-core/visits/:visitId/:action', async (request, reply) => {
    try {
      const params = request.params as { visitId: string; action: string };
      const action = parseTransitionAction(params.action);
      const context = parseTransitionBody(request.body ?? {});
      const visit = getFlowCoreSpikeRuntime().transition(params.visitId, action, context);
      if (!visit) {
        return reply.code(404).send({
          code: 'VISIT_NOT_FOUND',
          message: 'Visit not found.',
        });
      }
      return reply.send(mapFlowCoreVisitSummary(visit));
    } catch (error) {
      return sendFlowCoreError(reply, error);
    }
  });

  app.get('/api/v1/dev/flow-core/tv-snapshot', async (_request, reply) => {
    return reply.send(buildFlowCoreTvSnapshot(getFlowCoreSpikeRuntime()));
  });
}
