<script lang="ts">
  /**
   * Room-panel route orchestrator: login, URL deep-link reconcile, SSE snapshot, visit actions.
   *
   * API and pure helpers live in `$lib/room-panel/*` (api, transition, requested-url, snapshot-view).
   * Lifecycle validity (mount, session, stream, reconcile) is centralized in `room-panel-lifecycle.ts`.
   */
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import Button from '$lib/components/forms/Button.svelte';
  import CheckOutConfirmModal from '$lib/components/mfa/CheckOutConfirmModal.svelte';
  import RoomPanelPinLogin from '$lib/components/room-panel/RoomPanelPinLogin.svelte';
  import RoomPanelPreview from '$lib/components/room-panel/RoomPanelPreview.svelte';
  import type { RoomPanelItem, RoomPanelSnapshot } from '$lib/queue/openapi-types';
  import {
    callRoomPanelVisit,
    checkInRoomPanelVisit,
    checkOutRoomPanelVisit,
    connectRoomPanelQueueStream,
    fetchRoomPanelQueue,
    fetchRoomPanelRooms,
    loginRoomPanel,
    logoutRoomPanel,
    type RoomPanelRoom,
  } from '$lib/room-panel/room-panel-api';
  import {
    findRoomPanelLoginEntry,
    roomPanelLoginKey,
  } from '$lib/room-panel/room-panel-login-key';
  import {
    RoomPanelLifecycleCoordinator,
    readRoomPanelRequestedTarget,
    requestedTargetsEqual,
    shouldInvalidateSessionOnUrlChange,
    shouldRequestReconcileRetryOnUrlChange,
    urlAllowsLoginTarget,
    type RoomPanelRequestedTarget,
  } from '$lib/room-panel/room-panel-lifecycle';
  import {
    resolveRoomPanelQueueFetchOutcome,
    resolveRoomPanelTransitionOutcome,
    type RoomPanelTransitionOutcome,
  } from '$lib/room-panel/room-panel-transition';
  import {
    findRequestedRoomEntry,
    readRequestedPlacementParam,
    shouldReconcileRequestedUrl,
    snapshotMatchesRequestedUrl,
  } from '$lib/room-panel/room-panel-requested-url';
  import {
    getPracticeProfileFallback,
    mountPracticeProfileSync,
    practiceDisplayLabel,
  } from '$lib/practice/practice-profile-client';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { toastStore } from '$lib/stores/toastStore';

  const lifecycle = new RoomPanelLifecycleCoordinator();

  let loading = $state(true);
  let rooms = $state<RoomPanelRoom[]>([]);
  let selectedLoginKey = $state('');
  let pin = $state('');
  let errorMessage = $state<string | null>(null);
  let snapshot = $state<RoomPanelSnapshot | null>(null);
  let streamError = $state<string | null>(null);
  let submitting = $state(false);
  let recoveringSession = $state(false);
  let busyVisitId = $state<string | null>(null);
  let checkOutVisit = $state<RoomPanelItem | null>(null);
  let disconnectStream: (() => void) | null = null;
  let practiceProfile = $state(getPracticeProfileFallback());
  let reconcilingRoom = $state(false);
  let reconcileTarget: RoomPanelRequestedTarget | null = null;
  let lastObservedTarget: RoomPanelRequestedTarget | null = null;

  const requestedRoomIdFromUrl = $derived(page.url.searchParams.get('room')?.trim() ?? '');
  const requestedPlacementFromUrl = $derived(page.url.searchParams.get('placement')?.trim() ?? '');

  const practiceName = $derived(practiceDisplayLabel(practiceProfile, t('terminal.practiceFallback')));
  const selectedRoom = $derived(
    findRoomPanelLoginEntry(rooms, selectedLoginKey) ?? rooms[0] ?? null,
  );
  const pinRequired = $derived(selectedRoom?.requiresPin ?? true);
  const hasRooms = $derived(rooms.length > 0);
  const isLive = $derived(snapshot !== null);

  $effect(() => {
    if (!selectedLoginKey && rooms[0]) {
      selectedLoginKey = roomPanelLoginKey(rooms[0]);
    }
  });

  $effect(() => {
    const requestedTarget = readRequestedTarget();
    const requestedRoomId = requestedTarget.roomId;

    const urlChanged =
      Boolean(requestedRoomId) &&
      Boolean(lastObservedTarget?.roomId) &&
      !requestedTargetsEqual(lastObservedTarget!, requestedTarget);

    const snapshotMatchesTarget =
      snapshot !== null &&
      snapshotMatchesRequestedUrl(snapshot, requestedRoomId, requestedTarget.placement);

    if (urlChanged) {
      const invalidateSession = shouldInvalidateSessionOnUrlChange(
        snapshotMatchesTarget,
        submitting || recoveringSession,
      );

      if (invalidateSession) {
        lifecycle.invalidateSession();
        resetSessionScopedState();
        disconnectStreamInternal();

        // A matching snapshot is no longer trustworthy when an in-flight login may
        // already have replaced the session cookie. Force the latest target through reconcile.
        if (snapshotMatchesTarget) {
          snapshot = null;
        }
      }

      if (shouldRequestReconcileRetryOnUrlChange(reconcilingRoom)) {
        if (invalidateSession) {
          lifecycle.requestReconcileRetry();
        } else {
          // The URL moved back to the still-live session while reconcile was only
          // loading metadata. Cancel that run without dropping the current stream.
          lifecycle.cancelReconcile();
        }
      }
    }
    lastObservedTarget = requestedRoomId ? requestedTarget : null;

    if (!requestedRoomId) {
      return;
    }

    const requestedEntry = findRequestedRoomEntry(
      rooms,
      requestedTarget.roomId,
      requestedTarget.placement,
    );
    if (requestedEntry) {
      selectedLoginKey = roomPanelLoginKey(requestedEntry);
    }

    if (loading || submitting || recoveringSession) {
      return;
    }

    if (!shouldReconcileRequestedUrl(snapshot, requestedRoomId, requestedTarget.placement)) {
      return;
    }

    if (reconcilingRoom) {
      // URL change while reconciling already requested retry above when urlChanged.
      // Keep a safety check for target drift that did not go through lastObserved.
      if (
        !urlChanged &&
        reconcileTarget &&
        !requestedTargetsEqual(reconcileTarget, requestedTarget)
      ) {
        lifecycle.requestReconcileRetry();
      }
      return;
    }

    void reconcileRequestedRoom();
  });

  onMount(() => {
    const stopProfile = mountPracticeProfileSync((profile) => {
      practiceProfile = profile;
    });
    void bootstrapPanel();
    return () => {
      lifecycle.invalidateLifecycle();
      clearReloginTimer();
      disconnectStreamInternal();
      stopProfile();
    };
  });

  function readRequestedTarget(): RoomPanelRequestedTarget {
    return readRoomPanelRequestedTarget(requestedRoomIdFromUrl, requestedPlacementFromUrl);
  }

  function resetSessionScopedState() {
    busyVisitId = null;
    checkOutVisit = null;
  }

  function isSessionOperationCurrent(
    lifecycleGeneration: number,
    sessionGeneration: number,
  ): boolean {
    return lifecycle.isSessionOperationCurrent(lifecycleGeneration, sessionGeneration);
  }

  function isLoginOperationCurrent(
    lifecycleGeneration: number,
    sessionGeneration: number,
    loginTarget: RoomPanelRequestedTarget,
  ): boolean {
    return (
      isSessionOperationCurrent(lifecycleGeneration, sessionGeneration) &&
      urlAllowsLoginTarget(readRequestedTarget(), loginTarget)
    );
  }

  function isReconcileOperationCurrent(
    lifecycleGeneration: number,
    reconcileGeneration: number,
    requestedTarget: RoomPanelRequestedTarget,
  ): boolean {
    return (
      lifecycle.isCurrentReconcile(reconcileGeneration, lifecycleGeneration) &&
      requestedTargetsEqual(requestedTarget, readRequestedTarget())
    );
  }

  function disconnectStreamInternal() {
    if (disconnectStream) {
      lifecycle.invalidateStream();
      disconnectStream();
      disconnectStream = null;
    }
  }

  async function reconcileRequestedRoom(): Promise<boolean> {
    if (reconcilingRoom) {
      return false;
    }

    const lifecycleGeneration = lifecycle.captureLifecycle();
    const reconcileGeneration = lifecycle.captureReconcile();
    const requestedTarget = readRequestedTarget();
    if (!requestedTarget.roomId) {
      return true;
    }

    reconcilingRoom = true;
    reconcileTarget = requestedTarget;
    try {
      if (!(await loadRoomList(lifecycleGeneration, lifecycle.captureSession()))) {
        return false;
      }
      if (
        !isReconcileOperationCurrent(lifecycleGeneration, reconcileGeneration, requestedTarget)
      ) {
        return false;
      }

      const requestedEntry = findRequestedRoomEntry(
        rooms,
        requestedTarget.roomId,
        requestedTarget.placement,
      );
      if (requestedEntry) {
        selectedLoginKey = roomPanelLoginKey(requestedEntry);
      }
      if (!requestedEntry) {
        errorMessage = t('roomPanel.noRoomError');
        return false;
      }

      if (
        snapshot &&
        snapshotMatchesRequestedUrl(snapshot, requestedTarget.roomId, requestedTarget.placement)
      ) {
        return true;
      }

      lifecycle.invalidateSession();
      resetSessionScopedState();
      disconnectStreamInternal();

      snapshot = null;
      streamError = null;
      await logoutRoomPanel();
      return false;
    } finally {
      reconcilingRoom = false;
      reconcileTarget = null;
      if (
        lifecycle.consumeReconcilePending() &&
        lifecycle.isMounted() &&
        lifecycle.isActiveLifecycle(lifecycleGeneration)
      ) {
        void reconcileRequestedRoom();
      }
    }
  }

  async function tryRestoreSession(lifecycleGeneration: number): Promise<boolean> {
    const sessionGeneration = lifecycle.captureSession();
    const queueResult = await fetchRoomPanelQueue();
    if (!isSessionOperationCurrent(lifecycleGeneration, sessionGeneration)) {
      return false;
    }

    const outcome = resolveRoomPanelQueueFetchOutcome(queueResult, t('roomPanel.queueLoadError'));
    if (outcome.kind === 'sessionExpired') {
      return false;
    }
    if (outcome.kind !== 'success' || !queueResult.ok) {
      return false;
    }

    const requestedTarget = readRequestedTarget();
    if (
      requestedTarget.roomId &&
      !snapshotMatchesRequestedUrl(queueResult.data, requestedTarget.roomId, requestedTarget.placement)
    ) {
      return reconcileRequestedRoom();
    }

    snapshot = queueResult.data;
    startStream(lifecycleGeneration);
    return true;
  }

  async function loadRoomList(
    lifecycleGeneration: number,
    sessionGeneration: number,
  ): Promise<boolean> {
    errorMessage = null;
    const result = await fetchRoomPanelRooms();
    if (!isSessionOperationCurrent(lifecycleGeneration, sessionGeneration)) {
      return false;
    }
    if (!result.ok) {
      errorMessage = result.error.message || t('roomPanel.settingsLoadError');
      return false;
    }

    rooms = result.data.rooms;
    if (result.data.rooms.length === 0) {
      selectedLoginKey = '';
      return true;
    }

    const requestedTarget = readRequestedTarget();
    const urlEntry = requestedTarget.roomId
      ? findRequestedRoomEntry(result.data.rooms, requestedTarget.roomId, requestedTarget.placement)
      : null;
    if (urlEntry) {
      selectedLoginKey = roomPanelLoginKey(urlEntry);
    } else if (!findRoomPanelLoginEntry(result.data.rooms, selectedLoginKey)) {
      selectedLoginKey = roomPanelLoginKey(result.data.rooms[0]!);
    }
    return true;
  }

  async function bootstrapPanel() {
    const lifecycleGeneration = lifecycle.captureLifecycle();
    loading = true;
    errorMessage = null;

    if (await tryRestoreSession(lifecycleGeneration)) {
      if (lifecycle.isActiveLifecycle(lifecycleGeneration)) {
        loading = false;
      }
      return;
    }
    if (!lifecycle.isActiveLifecycle(lifecycleGeneration)) {
      return;
    }

    if (rooms.length === 0 && !(await loadRoomList(lifecycleGeneration, lifecycle.captureSession()))) {
      if (lifecycle.isActiveLifecycle(lifecycleGeneration)) {
        loading = false;
      }
      return;
    }
    if (!lifecycle.isActiveLifecycle(lifecycleGeneration)) {
      return;
    }
    loading = false;
  }

  async function refreshSnapshot(lifecycleGeneration: number, sessionGeneration: number) {
    const result = await fetchRoomPanelQueue();
    if (!isSessionOperationCurrent(lifecycleGeneration, sessionGeneration)) {
      return;
    }

    const outcome = resolveRoomPanelQueueFetchOutcome(result, t('roomPanel.queueLoadError'));
    if (outcome.kind === 'sessionExpired') {
      await recoverExpiredSession(outcome.message);
      return;
    }
    if (outcome.kind !== 'success' || !result.ok) {
      streamError = outcome.kind === 'error' ? outcome.message : t('roomPanel.queueLoadError');
      return;
    }
    snapshot = result.data;
    streamError = null;
  }

  function startStream(lifecycleGeneration: number) {
    if (!lifecycle.isMounted() || !lifecycle.isActiveLifecycle(lifecycleGeneration)) {
      return;
    }

    disconnectStreamInternal();
    if (!lifecycle.isMounted() || !lifecycle.isActiveLifecycle(lifecycleGeneration)) {
      return;
    }

    const streamGeneration = lifecycle.beginStream();
    if (streamGeneration < 0) {
      return;
    }

    disconnectStream = connectRoomPanelQueueStream({
      onSnapshot: (data) => {
        if (!lifecycle.isCurrentStream(streamGeneration, lifecycleGeneration)) {
          return;
        }
        const requestedTarget = readRequestedTarget();
        if (shouldReconcileRequestedUrl(data, requestedTarget.roomId, requestedTarget.placement)) {
          void reconcileRequestedRoom();
          return;
        }
        snapshot = data;
        streamError = null;
      },
      onError: (error) => {
        if (!lifecycle.isCurrentStream(streamGeneration, lifecycleGeneration)) {
          return;
        }
        if (error.sessionExpired) {
          void recoverExpiredSession(error.message);
          return;
        }
        streamError = error.message;
      },
    });
  }

  async function recoverExpiredSession(message: string) {
    if (recoveringSession) {
      return;
    }
    recoveringSession = true;
    const lifecycleGeneration = lifecycle.captureLifecycle();
    lifecycle.invalidateSession();
    try {
      disconnectStreamInternal();
      snapshot = null;
      streamError = null;
      resetSessionScopedState();
      rooms = [];
      await logoutRoomPanel();
      if (!lifecycle.isActiveLifecycle(lifecycleGeneration)) {
        return;
      }
      await bootstrapPanel();
      if (!lifecycle.isActiveLifecycle(lifecycleGeneration)) {
        return;
      }
      if (!snapshot) {
        errorMessage = message;
      }
    } finally {
      recoveringSession = false;
    }
  }

  async function completeLogin(room: RoomPanelRoom, lifecycleGeneration: number) {
    const sessionGeneration = lifecycle.captureSession();
    const loginTarget: RoomPanelRequestedTarget = {
      roomId: room.roomId,
      placement: room.placement,
    };
    submitting = true;
    errorMessage = null;
    streamError = null;

    const result = await loginRoomPanel({
      roomId: room.roomId,
      placement: room.placement,
      pin: pin.trim(),
    });
    if (!isLoginOperationCurrent(lifecycleGeneration, sessionGeneration, loginTarget)) {
      submitting = false;
      return;
    }
    if (!result.ok) {
      submitting = false;
      pin = '';
      errorMessage = result.error.status === 401 ? t('roomPanel.loginInvalid') : result.error.message;
      return;
    }

    pin = '';
    await refreshSnapshot(lifecycleGeneration, sessionGeneration);
    if (!isLoginOperationCurrent(lifecycleGeneration, sessionGeneration, loginTarget)) {
      submitting = false;
      return;
    }
    if (!snapshot) {
      submitting = false;
      errorMessage = streamError ?? t('roomPanel.queueLoadError');
      return;
    }

    startStream(lifecycleGeneration);
    if (!isLoginOperationCurrent(lifecycleGeneration, sessionGeneration, loginTarget)) {
      submitting = false;
      return;
    }
    submitting = false;
  }

  async function submitLogin() {
    errorMessage = null;
    if (!selectedRoom) {
      errorMessage = t('roomPanel.noRoomError');
      return;
    }
    if (pinRequired && pin.trim().length < 4) {
      errorMessage = t('roomPanel.pinError');
      return;
    }

    await completeLogin(selectedRoom, lifecycle.captureLifecycle());
  }

  async function applyTransitionOutcome(
    outcome: RoomPanelTransitionOutcome,
    lifecycleGeneration: number,
    sessionGeneration: number,
  ) {
    if (!isSessionOperationCurrent(lifecycleGeneration, sessionGeneration)) {
      return;
    }

    switch (outcome.kind) {
      case 'success':
        await refreshSnapshot(lifecycleGeneration, sessionGeneration);
        return;
      case 'conflict':
        toastStore.error(outcome.message);
        await refreshSnapshot(lifecycleGeneration, sessionGeneration);
        return;
      case 'forbidden':
        toastStore.error(outcome.message);
        await refreshSnapshot(lifecycleGeneration, sessionGeneration);
        return;
      case 'sessionExpired':
        await recoverExpiredSession(outcome.message);
        return;
      case 'error':
        streamError = outcome.message;
        return;
    }
  }

  async function runVisitAction(
    visitId: string,
    action: 'arrive' | 'check_out' | 'call',
  ) {
    if (busyVisitId) {
      return;
    }

    const lifecycleGeneration = lifecycle.captureLifecycle();
    const sessionGeneration = lifecycle.captureSession();
    busyVisitId = visitId;
    try {
      const result =
        action === 'call'
          ? await callRoomPanelVisit(visitId)
          : action === 'arrive'
            ? await checkInRoomPanelVisit(visitId)
            : await checkOutRoomPanelVisit(visitId);

      await applyTransitionOutcome(
        resolveRoomPanelTransitionOutcome(result, t('roomPanel.actionError')),
        lifecycleGeneration,
        sessionGeneration,
      );
      return result.ok;
    } finally {
      if (isSessionOperationCurrent(lifecycleGeneration, sessionGeneration)) {
        busyVisitId = null;
      }
    }
  }

  function requestCheckOut(visitId: string) {
    checkOutVisit = findPanelItem(visitId) ?? null;
  }

  async function confirmCheckOut() {
    const item = checkOutVisit;
    if (!item) {
      return;
    }
    const lifecycleGeneration = lifecycle.captureLifecycle();
    const sessionGeneration = lifecycle.captureSession();
    const succeeded = await runVisitAction(item.visitId, 'check_out');
    if (succeeded && isSessionOperationCurrent(lifecycleGeneration, sessionGeneration)) {
      checkOutVisit = null;
    }
  }

  function cancelCheckOut() {
    checkOutVisit = null;
  }

  let reloginTimer: ReturnType<typeof setTimeout> | null = null;

  function clearReloginTimer() {
    if (reloginTimer) {
      clearTimeout(reloginTimer);
      reloginTimer = null;
    }
  }

  function startReloginPress() {
    clearReloginTimer();
    reloginTimer = setTimeout(() => void forceRelogin(), 2500);
  }

  async function forceRelogin() {
    clearReloginTimer();
    const lifecycleGeneration = lifecycle.captureLifecycle();
    lifecycle.invalidateSession();
    resetSessionScopedState();
    disconnectStreamInternal();
    snapshot = null;
    streamError = null;
    errorMessage = null;
    await logoutRoomPanel();
    if (!lifecycle.isActiveLifecycle(lifecycleGeneration)) {
      return;
    }
    await bootstrapPanel();
  }

  function findPanelItem(visitId: string): RoomPanelItem | undefined {
    return snapshot?.items.find((item) => item.visitId === visitId);
  }
</script>

{#if isLive && snapshot}
  <div class="room-panel-live-shell">
    <RoomPanelPreview
      {snapshot}
      {busyVisitId}
      onArrive={(visitId) => void runVisitAction(visitId, 'arrive')}
      onCheckOut={requestCheckOut}
      onCall={(visitId) => void runVisitAction(visitId, 'call')}
    />
    <CheckOutConfirmModal
      ticket={checkOutVisit}
      documentCount={
        snapshot?.items.find((item) => item.visitId === checkOutVisit?.visitId)?.dischargeDocumentCount ?? 0
      }
      busy={checkOutVisit !== null && busyVisitId === checkOutVisit.visitId}
      onConfirm={() => void confirmCheckOut()}
      onCancel={cancelCheckOut}
    />
    <button
      type="button"
      class="room-panel-relogin-hotspot"
      aria-label={t('roomPanel.reloginHotspotAria')}
      tabindex="-1"
      onpointerdown={startReloginPress}
      onpointerup={clearReloginTimer}
      onpointercancel={clearReloginTimer}
      oncontextmenu={(event) => event.preventDefault()}
    ></button>
    {#if streamError}
      <div class="room-panel-live-actions">
        <span class="room-panel-live-error">{streamError}</span>
        <Button
          type="button"
          variant="outline"
          onclick={() => {
            if (!lifecycle.isMounted()) {
              return;
            }
            void refreshSnapshot(lifecycle.captureLifecycle(), lifecycle.captureSession());
          }}
        >
          {t('ui.retry')}
        </Button>
      </div>
    {/if}
  </div>
{:else if loading || submitting}
  <section class="room-panel-login">
    <div class="room-panel-login__shell">
      <p class="text-muted">{t('ui.loading')}</p>
    </div>
  </section>
{:else}
  <section class="room-panel-login">
    <div class="room-panel-login__shell">
      <p class="room-panel-login__kicker">{practiceName}</p>
      <RoomPanelPinLogin
        {rooms}
        bind:selectedLoginKey
        bind:pin
        {pinRequired}
        loading={false}
        {submitting}
        {errorMessage}
        onSubmit={() => void submitLogin()}
      />
      {#if !hasRooms}
        <Button type="button" variant="outline" onclick={() => void bootstrapPanel()}>{t('ui.retry')}</Button>
      {/if}
    </div>
  </section>
{/if}
