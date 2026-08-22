import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RoomPanelLifecycleCoordinator,
  readRoomPanelRequestedTarget,
  requestedTargetsEqual,
  shouldInvalidateSessionOnUrlChange,
  shouldRequestReconcileRetryOnUrlChange,
  urlAllowsLoginTarget,
} from './room-panel-lifecycle';

afterEach(() => {
  vi.useRealTimers();
});

describe('room panel lifecycle scenarios', () => {
  it('blocks stream start after unmount disposes lifecycle', () => {
    const lifecycle = new RoomPanelLifecycleCoordinator();
    const lifecycleGeneration = lifecycle.captureLifecycle();

    lifecycle.invalidateLifecycle();

    expect(lifecycle.isMounted()).toBe(false);
    expect(lifecycle.isActiveLifecycle(lifecycleGeneration)).toBe(false);
    expect(lifecycle.isActiveLifecycle(lifecycle.captureLifecycle())).toBe(false);
    expect(lifecycle.beginStream()).toBe(-1);
  });

  it('ignores delayed stream callbacks after disconnect invalidates the stream generation', () => {
    const lifecycle = new RoomPanelLifecycleCoordinator();
    const lifecycleGeneration = lifecycle.captureLifecycle();
    const streamGeneration = lifecycle.beginStream();
    let snapshot: string | null = 'room-a';

    const onSnapshot = (value: string) => {
      if (!lifecycle.isCurrentStream(streamGeneration, lifecycleGeneration)) {
        return;
      }
      snapshot = value;
    };

    lifecycle.invalidateStream();
    onSnapshot('stale-room-a');

    expect(snapshot).toBe('room-a');
  });

  it('lets only the newest reconcile target win after URL change', async () => {
    const lifecycle = new RoomPanelLifecycleCoordinator();
    const lifecycleGeneration = lifecycle.captureLifecycle();
    let currentTarget = readRoomPanelRequestedTarget('labor', 'outside');
    const readTarget = () => currentTarget;

    const reconcileGeneration = lifecycle.captureReconcile();
    const requestedTarget = readRoomPanelRequestedTarget('labor', 'outside');

    const loadRoomList = vi.fn(async () => {
      currentTarget = readRoomPanelRequestedTarget('labor', 'inside');
      lifecycle.requestReconcileRetry();
      return true;
    });

    await loadRoomList();

    const stillCurrent =
      lifecycle.isCurrentReconcile(reconcileGeneration, lifecycleGeneration) &&
      requestedTargetsEqual(requestedTarget, readTarget());

    expect(stillCurrent).toBe(false);
    expect(lifecycle.consumeReconcilePending()).toBe(true);
  });

  it('does not schedule reconcile retry when only the session changes', () => {
    const lifecycle = new RoomPanelLifecycleCoordinator();
    const reconcileGeneration = lifecycle.captureReconcile();

    lifecycle.invalidateSession();

    expect(lifecycle.captureReconcile()).toBe(reconcileGeneration);
    expect(lifecycle.consumeReconcilePending()).toBe(false);
  });

  it('schedules reconcile retry on URL change only while reconcile is in flight', () => {
    const lifecycle = new RoomPanelLifecycleCoordinator();

    expect(shouldRequestReconcileRetryOnUrlChange(false)).toBe(false);
    lifecycle.invalidateSession();
    expect(lifecycle.consumeReconcilePending()).toBe(false);

    const reconcileGeneration = lifecycle.captureReconcile();
    if (shouldRequestReconcileRetryOnUrlChange(true)) {
      lifecycle.requestReconcileRetry();
    }
    expect(lifecycle.isCurrentReconcile(reconcileGeneration, lifecycle.captureLifecycle())).toBe(
      false,
    );
    expect(lifecycle.consumeReconcilePending()).toBe(true);
  });

  it('keeps the live stream when a refined URL still matches the current snapshot', () => {
    const lifecycle = new RoomPanelLifecycleCoordinator();
    const lifecycleGeneration = lifecycle.captureLifecycle();
    const streamGeneration = lifecycle.beginStream();
    let disconnected = false;

    const snapshotMatchesTarget = true;
    const invalidateSession = shouldInvalidateSessionOnUrlChange(snapshotMatchesTarget, false);
    if (invalidateSession) {
      lifecycle.invalidateSession();
      disconnected = true;
    }

    expect(disconnected).toBe(false);
    expect(lifecycle.isCurrentStream(streamGeneration, lifecycleGeneration)).toBe(true);
  });

  it('cancels an early reconcile without dropping a compatible live stream', () => {
    const lifecycle = new RoomPanelLifecycleCoordinator();
    const lifecycleGeneration = lifecycle.captureLifecycle();
    const streamGeneration = lifecycle.beginStream();
    const reconcileGeneration = lifecycle.captureReconcile();

    const invalidateSession = shouldInvalidateSessionOnUrlChange(true, false);
    if (shouldRequestReconcileRetryOnUrlChange(true)) {
      if (invalidateSession) {
        lifecycle.requestReconcileRetry();
      } else {
        lifecycle.cancelReconcile();
      }
    }

    expect(lifecycle.isCurrentReconcile(reconcileGeneration, lifecycleGeneration)).toBe(false);
    expect(lifecycle.consumeReconcilePending()).toBe(false);
    expect(lifecycle.isCurrentStream(streamGeneration, lifecycleGeneration)).toBe(true);
  });

  it('forces latest-target reconcile when URL changes during a matching in-flight login', () => {
    const lifecycle = new RoomPanelLifecycleCoordinator();
    const lifecycleGeneration = lifecycle.captureLifecycle();
    const sessionGeneration = lifecycle.captureSession();
    const reconcileGeneration = lifecycle.captureReconcile();
    let snapshotPresent = true;

    const invalidateSession = shouldInvalidateSessionOnUrlChange(true, true);
    if (invalidateSession) {
      lifecycle.invalidateSession();
      snapshotPresent = false;
    }
    if (shouldRequestReconcileRetryOnUrlChange(true)) {
      lifecycle.requestReconcileRetry();
    }

    expect(snapshotPresent).toBe(false);
    expect(lifecycle.isSessionOperationCurrent(lifecycleGeneration, sessionGeneration)).toBe(false);
    expect(lifecycle.isCurrentReconcile(reconcileGeneration, lifecycleGeneration)).toBe(false);
    expect(lifecycle.consumeReconcilePending()).toBe(true);
  });

  it('does not self-retrigger after pin-required reconcile when pending was never set', () => {
    const lifecycle = new RoomPanelLifecycleCoordinator();
    const lifecycleGeneration = lifecycle.captureLifecycle();
    let reconcileRuns = 0;

    const runPinRequiredReconcile = () => {
      reconcileRuns += 1;
      lifecycle.invalidateSession();
      if (
        lifecycle.consumeReconcilePending() &&
        lifecycle.isMounted() &&
        lifecycle.isActiveLifecycle(lifecycleGeneration)
      ) {
        runPinRequiredReconcile();
      }
    };

    runPinRequiredReconcile();
    expect(reconcileRuns).toBe(1);
  });

  it('ignores delayed sessionExpired outcomes after session invalidation', async () => {
    const lifecycle = new RoomPanelLifecycleCoordinator();
    const lifecycleGeneration = lifecycle.captureLifecycle();
    const sessionGeneration = lifecycle.captureSession();
    let recoveryStarted = false;

    const applyTransitionOutcome = async (kind: 'sessionExpired' | 'error', message: string) => {
      if (!lifecycle.isSessionOperationCurrent(lifecycleGeneration, sessionGeneration)) {
        return;
      }
      if (kind === 'sessionExpired') {
        recoveryStarted = true;
        return;
      }
      void message;
    };

    lifecycle.invalidateSession();
    await applyTransitionOutcome('sessionExpired', 'stale session');

    expect(recoveryStarted).toBe(false);
  });

  it('clears session-scoped busy state on session switch but not from stale action finally', () => {
    const lifecycle = new RoomPanelLifecycleCoordinator();
    const lifecycleGeneration = lifecycle.captureLifecycle();
    const sessionGeneration = lifecycle.captureSession();
    let busyVisitId: string | null = 'visit-a';

    const resetSessionScopedState = () => {
      busyVisitId = null;
    };

    lifecycle.invalidateSession();
    resetSessionScopedState();
    expect(busyVisitId).toBeNull();

    busyVisitId = 'visit-b';
    if (lifecycle.isSessionOperationCurrent(lifecycleGeneration, sessionGeneration)) {
      busyVisitId = null;
    }
    expect(busyVisitId).toBe('visit-b');
  });

  it('clears relogin timer on dispose', () => {
    vi.useFakeTimers();
    const onRelogin = vi.fn();
    let reloginTimer: ReturnType<typeof setTimeout> | null = null;

    function clearReloginTimer() {
      if (reloginTimer) {
        clearTimeout(reloginTimer);
        reloginTimer = null;
      }
    }

    function startReloginPress() {
      clearReloginTimer();
      reloginTimer = setTimeout(() => onRelogin(), 2500);
    }

    function dispose() {
      clearReloginTimer();
    }

    startReloginPress();
    dispose();
    vi.advanceTimersByTime(3000);

    expect(onRelogin).not.toHaveBeenCalled();
  });

  it('blocks bootstrap login stream start when lifecycle is disposed mid-flight', async () => {
    const lifecycle = new RoomPanelLifecycleCoordinator();
    const lifecycleGeneration = lifecycle.captureLifecycle();
    let streamStarted = false;

    const login = vi.fn(async () => {
      lifecycle.invalidateLifecycle();
      return { ok: true as const };
    });

    const startStream = () => {
      if (!lifecycle.isMounted() || !lifecycle.isActiveLifecycle(lifecycleGeneration)) {
        return;
      }
      streamStarted = true;
    };

    await login();
    startStream();

    expect(streamStarted).toBe(false);
  });

  it('allows form login when URL has no room constraint', async () => {
    const lifecycle = new RoomPanelLifecycleCoordinator();
    const lifecycleGeneration = lifecycle.captureLifecycle();
    const sessionGeneration = lifecycle.captureSession();
    const loginTarget = readRoomPanelRequestedTarget('labor', 'outside');
    const urlTarget = readRoomPanelRequestedTarget('', '');
    let streamStarted = false;

    const isLoginOperationCurrent = () =>
      lifecycle.isSessionOperationCurrent(lifecycleGeneration, sessionGeneration) &&
      urlAllowsLoginTarget(urlTarget, loginTarget);

    await Promise.resolve();
    if (isLoginOperationCurrent()) {
      streamStarted = true;
    }

    expect(streamStarted).toBe(true);
  });

  it('allows room-only URL login for any placement of that room', () => {
    const lifecycle = new RoomPanelLifecycleCoordinator();
    const lifecycleGeneration = lifecycle.captureLifecycle();
    const sessionGeneration = lifecycle.captureSession();
    const loginTarget = readRoomPanelRequestedTarget('labor', 'outside');
    const urlTarget = readRoomPanelRequestedTarget('labor', '');

    expect(
      lifecycle.isSessionOperationCurrent(lifecycleGeneration, sessionGeneration) &&
        urlAllowsLoginTarget(urlTarget, loginTarget),
    ).toBe(true);
  });

  it('aborts login when URL target no longer allows the login room', async () => {
    const lifecycle = new RoomPanelLifecycleCoordinator();
    const lifecycleGeneration = lifecycle.captureLifecycle();
    const sessionGeneration = lifecycle.captureSession();
    let currentTarget = readRoomPanelRequestedTarget('labor', 'outside');
    const loginTarget = readRoomPanelRequestedTarget('labor', 'outside');
    let streamStarted = false;

    const isLoginOperationCurrent = () =>
      lifecycle.isSessionOperationCurrent(lifecycleGeneration, sessionGeneration) &&
      urlAllowsLoginTarget(currentTarget, loginTarget);

    const login = vi.fn(async () => {
      currentTarget = readRoomPanelRequestedTarget('labor', 'inside');
      lifecycle.invalidateSession();
      return { ok: true as const };
    });

    await login();
    if (isLoginOperationCurrent()) {
      streamStarted = true;
    }

    expect(streamStarted).toBe(false);
  });
});
