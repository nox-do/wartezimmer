<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
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
  let forceLoginScreen = $state(false);
  let disconnectStream: (() => void) | null = null;
  let practiceProfile = $state(getPracticeProfileFallback());
  let reconcilingRoom = $state(false);

  const requestedRoomIdFromUrl = $derived($page.url.searchParams.get('room')?.trim() ?? '');
  const requestedPlacementFromUrl = $derived($page.url.searchParams.get('placement')?.trim() ?? '');

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
    const requestedRoomId = requestedRoomIdFromUrl;
    if (!requestedRoomId || loading || submitting || recoveringSession || reconcilingRoom) {
      return;
    }
    const requestedPlacement = readRequestedPlacementParam(requestedPlacementFromUrl);
    const requestedEntry = findRequestedRoomEntry(rooms, requestedRoomId, requestedPlacement);
    if (requestedEntry) {
      selectedLoginKey = roomPanelLoginKey(requestedEntry);
    }
    if (
      !shouldReconcileRequestedUrl(snapshot, requestedRoomId, requestedPlacement)
    ) {
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
      stopProfile();
      disconnectStream?.();
    };
  });

  function readRequestedRoomId(): string {
    return requestedRoomIdFromUrl;
  }

  function readRequestedPlacement(): string {
    return readRequestedPlacementParam(requestedPlacementFromUrl);
  }

  function resolveAutoOpenLoginKey(): string | null {
    const requestedRoomId = readRequestedRoomId();
    const requestedPlacement = readRequestedPlacement();
    if (requestedRoomId) {
      const matches = rooms.filter((entry) => entry.roomId === requestedRoomId);
      const room =
        findRequestedRoomEntry(matches, requestedRoomId, requestedPlacement) ??
        matches.find((entry) => entry.placement === 'outside') ??
        matches[0] ??
        null;
      return room && !room.requiresPin ? roomPanelLoginKey(room) : null;
    }

    const pinFreeRooms = rooms.filter((entry) => !entry.requiresPin);
    return pinFreeRooms.length === 1 ? roomPanelLoginKey(pinFreeRooms[0]!) : null;
  }

  async function reconcileRequestedRoom(): Promise<boolean> {
    if (reconcilingRoom) {
      return false;
    }
    reconcilingRoom = true;
    const requestedRoomId = readRequestedRoomId();
    if (!requestedRoomId) {
      reconcilingRoom = false;
      return true;
    }

    try {
      if (!(await loadRoomList())) {
        return false;
      }

      const requestedPlacement = readRequestedPlacement();
      const requestedEntry = findRequestedRoomEntry(rooms, requestedRoomId, requestedPlacement);
      if (requestedEntry) {
        selectedLoginKey = roomPanelLoginKey(requestedEntry);
      }
      if (!requestedEntry) {
        errorMessage = t('roomPanel.noRoomError');
        return false;
      }

      if (
        snapshot &&
        snapshotMatchesRequestedUrl(snapshot, requestedRoomId, requestedPlacement)
      ) {
        return true;
      }

      disconnectStream?.();
      disconnectStream = null;

      if (!requestedEntry.requiresPin) {
        await completeLogin(requestedEntry);
        return (
          snapshot?.roomId === requestedRoomId &&
          snapshot.panel.placement === requestedEntry.placement
        );
      }

      snapshot = null;
      streamError = null;
      await logoutRoomPanel();
      return false;
    } finally {
      reconcilingRoom = false;
    }
  }

  async function tryRestoreSession(): Promise<boolean> {
    const queueResult = await fetchRoomPanelQueue();
    const outcome = resolveRoomPanelQueueFetchOutcome(queueResult, t('roomPanel.queueLoadError'));
    if (outcome.kind === 'sessionExpired') {
      return false;
    }
    if (outcome.kind !== 'success' || !queueResult.ok) {
      return false;
    }

    const requestedRoomId = readRequestedRoomId();
    if (
      requestedRoomId &&
      !snapshotMatchesRequestedUrl(queueResult.data, requestedRoomId, readRequestedPlacement())
    ) {
      return reconcileRequestedRoom();
    }

    snapshot = queueResult.data;
    startStream();
    return true;
  }

  async function loadRoomList(): Promise<boolean> {
    errorMessage = null;
    const result = await fetchRoomPanelRooms();
    if (!result.ok) {
      errorMessage = result.error.message || t('roomPanel.settingsLoadError');
      return false;
    }

    rooms = result.data.rooms;
    if (result.data.rooms.length === 0) {
      selectedLoginKey = '';
      return true;
    }

    const urlRoomId = readRequestedRoomId();
    const urlPlacement = readRequestedPlacement();
    const urlEntry = urlRoomId ? findRequestedRoomEntry(result.data.rooms, urlRoomId, urlPlacement) : null;
    if (urlEntry) {
      selectedLoginKey = roomPanelLoginKey(urlEntry);
    } else if (!findRoomPanelLoginEntry(result.data.rooms, selectedLoginKey)) {
      selectedLoginKey = roomPanelLoginKey(result.data.rooms[0]!);
    }
    return true;
  }

  async function bootstrapPanel() {
    loading = true;
    errorMessage = null;

    if (await tryRestoreSession()) {
      loading = false;
      return;
    }

    if (rooms.length === 0 && !(await loadRoomList())) {
      loading = false;
      return;
    }

    const autoOpenLoginKey = resolveAutoOpenLoginKey();
    if (autoOpenLoginKey && !forceLoginScreen) {
      const autoOpenEntry = findRoomPanelLoginEntry(rooms, autoOpenLoginKey);
      if (autoOpenEntry) {
        await completeLogin(autoOpenEntry);
      }
    }
    forceLoginScreen = false;
    loading = false;
  }

  async function refreshSnapshot() {
    const result = await fetchRoomPanelQueue();
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

  function startStream() {
    disconnectStream?.();
    disconnectStream = connectRoomPanelQueueStream({
      onSnapshot: (data) => {
        if (shouldReconcileRequestedUrl(data, readRequestedRoomId(), readRequestedPlacement())) {
          void reconcileRequestedRoom();
          return;
        }
        snapshot = data;
        streamError = null;
      },
      onError: (error) => {
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
    disconnectStream?.();
    disconnectStream = null;
    snapshot = null;
    streamError = null;
    busyVisitId = null;
    rooms = [];
    await logoutRoomPanel();
    await bootstrapPanel();
    if (!snapshot) {
      errorMessage = message;
    }
    recoveringSession = false;
  }

  async function completeLogin(room: RoomPanelRoom) {
    submitting = true;
    errorMessage = null;
    streamError = null;

    const result = await loginRoomPanel({
      roomId: room.roomId,
      placement: room.placement,
      pin: pin.trim(),
    });
    if (!result.ok) {
      submitting = false;
      errorMessage = result.error.status === 401 ? t('roomPanel.loginInvalid') : result.error.message;
      return;
    }

    pin = '';
    await refreshSnapshot();
    if (!snapshot) {
      submitting = false;
      errorMessage = streamError ?? t('roomPanel.queueLoadError');
      return;
    }

    startStream();
    submitting = false;
  }

  async function submitLogin() {
    errorMessage = null;
    if (!selectedRoom) {
      errorMessage = t('roomPanel.noRoomError');
      return;
    }
    if (selectedRoom.requiresPin && pin.trim().length < 4) {
      errorMessage = t('roomPanel.pinError');
      return;
    }

    await completeLogin(selectedRoom);
  }

  async function applyTransitionOutcome(outcome: RoomPanelTransitionOutcome) {
    switch (outcome.kind) {
      case 'success':
        await refreshSnapshot();
        return;
      case 'conflict':
        toastStore.error(outcome.message);
        await refreshSnapshot();
        return;
      case 'forbidden':
        toastStore.error(outcome.message);
        await refreshSnapshot();
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
      );
    } finally {
      busyVisitId = null;
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
    await runVisitAction(item.visitId, 'check_out');
    checkOutVisit = null;
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
    forceLoginScreen = true;
    checkOutVisit = null;
    busyVisitId = null;
    disconnectStream?.();
    disconnectStream = null;
    snapshot = null;
    streamError = null;
    errorMessage = null;
    await logoutRoomPanel();
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
        <Button type="button" variant="outline" onclick={() => void refreshSnapshot()}>{t('ui.retry')}</Button>
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
