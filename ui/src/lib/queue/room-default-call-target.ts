import type { PracticeRoom } from '$lib/ops/openapi-types';
import {
  ensureSingleDefaultCallTarget as domainEnsureSingleDefaultCallTarget,
  listEnabledRooms as domainListEnabledRooms,
  resolveDefaultCallRoomId as domainResolveDefaultCallRoomId,
} from '@praxis-flow/domain';

export function listEnabledRooms(rooms: PracticeRoom[]): PracticeRoom[] {
  return domainListEnabledRooms(rooms);
}

export function ensureSingleDefaultCallTarget(
  rooms: PracticeRoom[],
  preferredRoomId?: string | null,
): PracticeRoom[] {
  return domainEnsureSingleDefaultCallTarget(rooms, preferredRoomId);
}

export function defaultCallRoom(rooms: PracticeRoom[]): PracticeRoom | undefined {
  return listEnabledRooms(rooms).find((room) => room.defaultCallTarget);
}

export function resolveDefaultCallRoomId(rooms: PracticeRoom[]): string | null {
  return domainResolveDefaultCallRoomId(rooms);
}
