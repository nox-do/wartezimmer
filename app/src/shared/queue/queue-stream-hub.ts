import type { CoreDatabase } from '../db/database.js';
import { buildMfaQueueSnapshot, type MfaQueueSnapshot } from './mfa-queue-snapshot.js';
import {
  buildRoomPanelQueueSnapshot,
  type RoomPanelQueueSnapshot,
} from './room-panel-queue-snapshot.js';
import { buildTvQueueSnapshot, type TvQueueSnapshot } from './tv-queue-snapshot.js';
import type { RoomPanelSession } from '../../auth/staff-session-auth.js';

type TvStreamListener = (snapshot: TvQueueSnapshot) => void;
type MfaStreamListener = (snapshot: MfaQueueSnapshot) => void;
type RoomPanelStreamListener = {
  session: Pick<RoomPanelSession, 'roomId' | 'placement'>;
  listener: (snapshot: RoomPanelQueueSnapshot) => void;
};

let revision = 0;
const tvListeners = new Set<TvStreamListener>();
const mfaListeners = new Set<MfaStreamListener>();
const roomPanelListeners = new Set<RoomPanelStreamListener>();

export function getQueueRevision(): number {
  return revision;
}

export function subscribeQueueStream(listener: TvStreamListener): () => void {
  tvListeners.add(listener);
  return () => {
    tvListeners.delete(listener);
  };
}

export function subscribeMfaQueueStream(listener: MfaStreamListener): () => void {
  mfaListeners.add(listener);
  return () => {
    mfaListeners.delete(listener);
  };
}

export function subscribeRoomPanelQueueStream(
  session: Pick<RoomPanelSession, 'roomId' | 'placement'>,
  listener: (snapshot: RoomPanelQueueSnapshot) => void,
): () => void {
  const entry = { session, listener };
  roomPanelListeners.add(entry);
  return () => {
    roomPanelListeners.delete(entry);
  };
}

export function publishTvQueueUpdate(db: CoreDatabase): TvQueueSnapshot {
  revision += 1;
  const tvSnapshot = buildTvQueueSnapshot(db, revision);
  const mfaSnapshot = buildMfaQueueSnapshot(db, revision);

  for (const listener of tvListeners) {
    try {
      listener(tvSnapshot);
    } catch {
      tvListeners.delete(listener);
    }
  }
  for (const listener of mfaListeners) {
    try {
      listener(mfaSnapshot);
    } catch {
      mfaListeners.delete(listener);
    }
  }
  for (const entry of roomPanelListeners) {
    try {
      entry.listener(buildRoomPanelQueueSnapshot(db, revision, entry.session));
    } catch {
      roomPanelListeners.delete(entry);
    }
  }

  return tvSnapshot;
}

export function publishExpiredRecallWindows(db: CoreDatabase): string[] {
  const changed = db.processExpiredRecallWindows();
  if (changed.length > 0) {
    publishTvQueueUpdate(db);
  }
  return changed;
}

export function publishExpiredRecallWindowForVisit(db: CoreDatabase, visitId: string): boolean {
  const changed = db.processExpiredRecallWindowForVisit(visitId);
  if (changed) {
    publishTvQueueUpdate(db);
  }
  return changed;
}

export function currentTvQueueSnapshot(db: CoreDatabase): TvQueueSnapshot {
  return buildTvQueueSnapshot(db, revision);
}

export function currentMfaQueueSnapshot(db: CoreDatabase): MfaQueueSnapshot {
  return buildMfaQueueSnapshot(db, revision);
}

export function currentRoomPanelQueueSnapshot(
  db: CoreDatabase,
  session: Pick<RoomPanelSession, 'roomId' | 'placement'>,
): RoomPanelQueueSnapshot {
  return buildRoomPanelQueueSnapshot(db, revision, session);
}
