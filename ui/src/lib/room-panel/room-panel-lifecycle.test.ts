import { describe, expect, it } from 'vitest';
import {
  RoomPanelLifecycleCoordinator,
  readRoomPanelRequestedTarget,
  requestedTargetsEqual,
  shouldInvalidateSessionOnUrlChange,
  shouldRequestReconcileRetryOnUrlChange,
  urlAllowsLoginTarget,
} from './room-panel-lifecycle';

describe('readRoomPanelRequestedTarget', () => {
  it('normalizes room id and placement params', () => {
    expect(readRoomPanelRequestedTarget(' labor ', 'inside')).toEqual({
      roomId: 'labor',
      placement: 'inside',
    });
    expect(readRoomPanelRequestedTarget('labor', 'invalid')).toEqual({
      roomId: 'labor',
      placement: '',
    });
  });
});

describe('requestedTargetsEqual', () => {
  it('compares room and placement together', () => {
    expect(
      requestedTargetsEqual(
        { roomId: 'labor', placement: 'inside' },
        { roomId: 'labor', placement: 'inside' },
      ),
    ).toBe(true);
    expect(
      requestedTargetsEqual(
        { roomId: 'labor', placement: 'inside' },
        { roomId: 'labor', placement: 'outside' },
      ),
    ).toBe(false);
    expect(
      requestedTargetsEqual(
        { roomId: 'labor', placement: 'inside' },
        { roomId: 'ekg', placement: 'inside' },
      ),
    ).toBe(false);
  });
});

describe('urlAllowsLoginTarget', () => {
  it('allows any login when the URL has no room constraint', () => {
    expect(
      urlAllowsLoginTarget(
        { roomId: '', placement: '' },
        { roomId: 'labor', placement: 'outside' },
      ),
    ).toBe(true);
  });

  it('allows any placement when the URL only names a room', () => {
    expect(
      urlAllowsLoginTarget(
        { roomId: 'labor', placement: '' },
        { roomId: 'labor', placement: 'outside' },
      ),
    ).toBe(true);
    expect(
      urlAllowsLoginTarget(
        { roomId: 'labor', placement: '' },
        { roomId: 'labor', placement: 'inside' },
      ),
    ).toBe(true);
  });

  it('rejects a different room or mismatched placement', () => {
    expect(
      urlAllowsLoginTarget(
        { roomId: 'labor', placement: '' },
        { roomId: 'ekg', placement: 'outside' },
      ),
    ).toBe(false);
    expect(
      urlAllowsLoginTarget(
        { roomId: 'labor', placement: 'inside' },
        { roomId: 'labor', placement: 'outside' },
      ),
    ).toBe(false);
    expect(
      urlAllowsLoginTarget(
        { roomId: 'labor', placement: 'inside' },
        { roomId: 'labor', placement: 'inside' },
      ),
    ).toBe(true);
  });
});

describe('shouldRequestReconcileRetryOnUrlChange', () => {
  it('requests retry only while a reconcile is in flight', () => {
    expect(shouldRequestReconcileRetryOnUrlChange(true)).toBe(true);
    expect(shouldRequestReconcileRetryOnUrlChange(false)).toBe(false);
  });
});

describe('shouldInvalidateSessionOnUrlChange', () => {
  it('keeps an idle live session when the new URL still matches its snapshot', () => {
    expect(shouldInvalidateSessionOnUrlChange(true, false)).toBe(false);
  });

  it('invalidates a session when the new URL needs another target', () => {
    expect(shouldInvalidateSessionOnUrlChange(false, false)).toBe(true);
  });

  it('invalidates a matching snapshot while a session mutation is in flight', () => {
    expect(shouldInvalidateSessionOnUrlChange(true, true)).toBe(true);
  });
});

describe('RoomPanelLifecycleCoordinator', () => {
  it('disposes lifecycle and blocks later captures from becoming active', () => {
    const coordinator = new RoomPanelLifecycleCoordinator();
    const lifecycleGeneration = coordinator.captureLifecycle();
    const sessionGeneration = coordinator.captureSession();
    const streamGeneration = coordinator.beginStream();
    const reconcileGeneration = coordinator.captureReconcile();

    coordinator.invalidateLifecycle();

    expect(coordinator.isMounted()).toBe(false);
    expect(coordinator.isActiveLifecycle(lifecycleGeneration)).toBe(false);
    expect(coordinator.isActiveLifecycle(coordinator.captureLifecycle())).toBe(false);
    expect(coordinator.isCurrentSession(sessionGeneration)).toBe(false);
    expect(coordinator.isCurrentStream(streamGeneration, lifecycleGeneration)).toBe(false);
    expect(coordinator.isCurrentReconcile(reconcileGeneration, lifecycleGeneration)).toBe(false);
    expect(coordinator.consumeReconcilePending()).toBe(false);
    expect(coordinator.beginStream()).toBe(-1);
  });

  it('invalidates session and stream without touching reconcile retry state', () => {
    const coordinator = new RoomPanelLifecycleCoordinator();
    const lifecycleGeneration = coordinator.captureLifecycle();
    const sessionGeneration = coordinator.captureSession();
    const streamGeneration = coordinator.beginStream();
    const reconcileGeneration = coordinator.captureReconcile();

    coordinator.invalidateSession();

    expect(coordinator.isActiveLifecycle(lifecycleGeneration)).toBe(true);
    expect(coordinator.isCurrentSession(sessionGeneration)).toBe(false);
    expect(coordinator.isCurrentStream(streamGeneration, lifecycleGeneration)).toBe(false);
    expect(coordinator.isCurrentReconcile(reconcileGeneration, lifecycleGeneration)).toBe(true);
    expect(coordinator.consumeReconcilePending()).toBe(false);
  });

  it('invalidates stream callbacks before disconnect and assigns a new stream generation', () => {
    const coordinator = new RoomPanelLifecycleCoordinator();
    const lifecycleGeneration = coordinator.captureLifecycle();
    const previousStreamGeneration = coordinator.beginStream();

    coordinator.invalidateStream();
    const nextStreamGeneration = coordinator.beginStream();

    expect(coordinator.isCurrentStream(previousStreamGeneration, lifecycleGeneration)).toBe(false);
    expect(coordinator.isCurrentStream(nextStreamGeneration, lifecycleGeneration)).toBe(true);
  });

  it('cancels reconcile without scheduling a retry', () => {
    const coordinator = new RoomPanelLifecycleCoordinator();
    const lifecycleGeneration = coordinator.captureLifecycle();
    const reconcileGeneration = coordinator.captureReconcile();

    coordinator.cancelReconcile();

    expect(coordinator.isCurrentReconcile(reconcileGeneration, lifecycleGeneration)).toBe(false);
    expect(coordinator.consumeReconcilePending()).toBe(false);
  });

  it('requests reconcile retry when URL target changes during an in-flight reconcile', () => {
    const coordinator = new RoomPanelLifecycleCoordinator();
    const lifecycleGeneration = coordinator.captureLifecycle();
    const reconcileGeneration = coordinator.captureReconcile();

    coordinator.requestReconcileRetry();

    expect(coordinator.isCurrentReconcile(reconcileGeneration, lifecycleGeneration)).toBe(false);
    expect(coordinator.consumeReconcilePending()).toBe(true);
    expect(coordinator.consumeReconcilePending()).toBe(false);
  });

  it('tracks session operations against lifecycle and session generation', () => {
    const coordinator = new RoomPanelLifecycleCoordinator();
    const lifecycleGeneration = coordinator.captureLifecycle();
    const sessionGeneration = coordinator.captureSession();

    expect(coordinator.isSessionOperationCurrent(lifecycleGeneration, sessionGeneration)).toBe(
      true,
    );

    coordinator.invalidateSession();
    expect(coordinator.isSessionOperationCurrent(lifecycleGeneration, sessionGeneration)).toBe(
      false,
    );
  });
});
