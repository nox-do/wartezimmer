import type { FastifyReply } from 'fastify';
import type { CoreDatabase } from '../../shared/db/database.js';
import { publishTvQueueUpdate } from '../../shared/queue/queue-stream-hub.js';
import { handleQueueRouteError } from './queue-errors.js';

export function runQueueMutation<TResult, TResponse>(input: {
  db: CoreDatabase;
  reply: FastifyReply;
  ticketId: string;
  execute: () => TResult;
  mapSuccess: (result: TResult) => TResponse;
  invalidTransitionMessage: string;
}): TResponse | undefined {
  try {
    const result = input.execute();
    publishTvQueueUpdate(input.db);
    return input.mapSuccess(result);
  } catch (error) {
    const handled = handleQueueRouteError(input.reply, input.ticketId, error, {
      invalidTransitionMessage: input.invalidTransitionMessage,
    });
    if (handled) {
      return undefined;
    }
    throw error;
  }
}
