import { parentPort, workerData } from 'node:worker_threads';
import { openDb, createRuntime } from '@wartezimmer/flow-core/server';

const { dbPath, index } = workerData as { dbPath: string; index?: number };

const runtime = createRuntime(openDb({ path: dbPath }));
const visit = runtime.checkIn({
  topicId: 'general',
  displayName: `Parallel-${index ?? ''}`,
  surfaceId: 'terminal_1',
});
parentPort!.postMessage(visit!.queueNumber);
