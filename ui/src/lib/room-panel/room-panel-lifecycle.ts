import type { RoomPanelPlacement } from '@praxis-flow/domain';
import { readRequestedPlacementParam } from './room-panel-requested-url';

export type RoomPanelRequestedTarget = {
  roomId: string;
  placement: RoomPanelPlacement | '';
};

export function readRoomPanelRequestedTarget(
  roomIdParam: string,
  placementParam: string,
): RoomPanelRequestedTarget {
  return {
    roomId: roomIdParam.trim(),
    placement: readRequestedPlacementParam(placementParam),
  };
}

export function requestedTargetsEqual(
  a: RoomPanelRequestedTarget,
  b: RoomPanelRequestedTarget,
): boolean {
  return a.roomId === b.roomId && a.placement === b.placement;
}

/**
 * Whether the current URL still permits completing a login for `loginTarget`.
 *
 * Empty URL room → no deep-link constraint (form login allowed).
 * Room without placement → any placement of that room is allowed.
 */
export function urlAllowsLoginTarget(
  urlTarget: RoomPanelRequestedTarget,
  loginTarget: RoomPanelRequestedTarget,
): boolean {
  if (!urlTarget.roomId) {
    return true;
  }
  if (urlTarget.roomId !== loginTarget.roomId) {
    return false;
  }
  if (!urlTarget.placement) {
    return true;
  }
  return urlTarget.placement === loginTarget.placement;
}

/**
 * On URL change: schedule a pending reconcile retry only while reconcile is in flight.
 * Otherwise the effect starts reconcile when idle — setting pending would self-retrigger.
 */
export function shouldRequestReconcileRetryOnUrlChange(reconciling: boolean): boolean {
  return reconciling;
}

/**
 * Whether a changed URL target makes the current session state unsafe to keep.
 *
 * A matching live snapshot can keep its session and stream. An in-flight session mutation
 * (for example login) still wins here because its response may already replace the cookie.
 */
export function shouldInvalidateSessionOnUrlChange(
  snapshotMatchesTarget: boolean,
  sessionMutationInFlight: boolean,
): boolean {
  return !snapshotMatchesTarget || sessionMutationInFlight;
}

/**
 * Tracks lifecycle, session, stream, and reconcile validity for the room-panel route.
 *
 * - Lifecycle: disposed on unmount; blocks all async continuations and stream starts.
 * - Session: invalidated on room switch, relogin, or session recovery; blocks REST/UI updates.
 * - Stream: invalidated before disconnect; stream callbacks compare their captured generation.
 * - Reconcile: latest URL wins; stale reconcile runs abort after awaits.
 */
export class RoomPanelLifecycleCoordinator {
  private disposed = false;
  private lifecycleGeneration = 0;
  private sessionGeneration = 0;
  private streamGeneration = 0;
  private reconcileGeneration = 0;
  private reconcilePending = false;

  isMounted(): boolean {
    return !this.disposed;
  }

  captureLifecycle(): number {
    return this.lifecycleGeneration;
  }

  isActiveLifecycle(generation: number): boolean {
    return !this.disposed && generation === this.lifecycleGeneration;
  }

  invalidateLifecycle(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.lifecycleGeneration += 1;
    this.sessionGeneration += 1;
    this.streamGeneration += 1;
    this.reconcileGeneration += 1;
    this.reconcilePending = false;
  }

  captureSession(): number {
    return this.sessionGeneration;
  }

  isCurrentSession(generation: number): boolean {
    return !this.disposed && generation === this.sessionGeneration;
  }

  isSessionOperationCurrent(lifecycleGeneration: number, sessionGeneration: number): boolean {
    return this.isActiveLifecycle(lifecycleGeneration) && this.isCurrentSession(sessionGeneration);
  }

  invalidateSession(): void {
    if (this.disposed) {
      return;
    }
    this.sessionGeneration += 1;
    this.invalidateStream();
  }

  invalidateStream(): void {
    if (this.disposed) {
      return;
    }
    this.streamGeneration += 1;
  }

  beginStream(): number {
    if (this.disposed) {
      return -1;
    }
    this.streamGeneration += 1;
    return this.streamGeneration;
  }

  isCurrentStream(streamGeneration: number, lifecycleGeneration: number): boolean {
    return (
      this.isActiveLifecycle(lifecycleGeneration) &&
      streamGeneration >= 0 &&
      streamGeneration === this.streamGeneration
    );
  }

  captureReconcile(): number {
    return this.reconcileGeneration;
  }

  isCurrentReconcile(reconcileGeneration: number, lifecycleGeneration: number): boolean {
    return (
      this.isActiveLifecycle(lifecycleGeneration) &&
      reconcileGeneration === this.reconcileGeneration
    );
  }

  cancelReconcile(): void {
    if (this.disposed) {
      return;
    }
    this.reconcileGeneration += 1;
  }

  requestReconcileRetry(): void {
    if (this.disposed) {
      return;
    }
    this.reconcileGeneration += 1;
    this.reconcilePending = true;
  }

  consumeReconcilePending(): boolean {
    if (!this.reconcilePending) {
      return false;
    }
    this.reconcilePending = false;
    return true;
  }
}
