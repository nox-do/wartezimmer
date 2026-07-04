import type { CoreDatabase } from '../db/database.js';

export type TvQueueSnapshot = {
  revision: number;
  view: 'tv';
  items: Array<{
    laneCode: string;
    number: number;
    status: string;
    roomLabel: string | null;
  }>;
  checkinLocked: boolean;
  serverTime: string;
};

export function buildTvQueueSnapshot(db: CoreDatabase, revision: number): TvQueueSnapshot {
  const queueItems = db.listQueue();

  return {
    revision,
    view: 'tv',
    items: queueItems.map((item) => ({
      laneCode: item.laneCode,
      number: item.number,
      status: item.status,
      roomLabel: item.roomLabel,
    })),
    checkinLocked: db.isCheckinLocked(),
    serverTime: new Date().toISOString(),
  };
}
