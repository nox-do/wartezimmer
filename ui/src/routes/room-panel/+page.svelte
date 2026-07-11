<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { formatTicketCode } from '@praxis-flow/domain';
  import Button from '$lib/components/forms/Button.svelte';
  import CheckOutConfirmModal from '$lib/components/mfa/CheckOutConfirmModal.svelte';
  import RoomPanelPinLogin from '$lib/components/room-panel/RoomPanelPinLogin.svelte';
  import RoomPanelPreview from '$lib/components/room-panel/RoomPanelPreview.svelte';
  import {
    DEFAULT_ROOM_PANEL_SETTINGS,
    type PracticeRoomWithPanel,
  } from '$lib/queue/ops-settings-api';
  import type { RoomPanelItem, RoomPanelSnapshot } from '$lib/queue/openapi-types';
  import {
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
    getPracticeProfileFallback,
    mountPracticeProfileSync,
    practiceDisplayLabel,
  } from '$lib/practice/practice-profile-client';
  import { t } from '$lib/i18n/i18nStore.svelte';

  let loading = $state(true);
  let rooms = $state<RoomPanelRoom[]>([]);
  let selectedRoomId = $state('');
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

  const practiceName = $derived(practiceDisplayLabel(practiceProfile, t('terminal.practiceFallback')));
  const selectedRoom = $derived(rooms.find((room) => room.roomId === selectedRoomId) ?? rooms[0] ?? null);
  const pinRequired = $derived(selectedRoom?.requiresPin ?? true);
  const hasRooms = $derived(rooms.length > 0);
  const isLive = $derived(snapshot !== null);
  const panelItems = $derived(snapshot?.items ?? []);
  const queueEntries = $derived(
    panelItems.map((item) => ({
      visitId: item.visitId,
      ticketCode: formatTicketCode(item.laneCode, item.number),
      patientName: item.identityRef,
      status: item.status,
    })),
  );
  const liveRoom = $derived(snapshot ? roomFromSnapshot(snapshot) : selectedRoom ? roomFromLoginRoom(selectedRoom) : null);
  const liveState = $derived(
    panelItems.some((item) => item.status === 'called' || item.status === 'directed')
      ? 'enter'
      : panelItems.some((item) => item.status === 'in_room')
        ? 'arrival'
        : 'waiting',
  );
  const liveStateLabel = $derived(resolveLiveStateLabel());

  function resolveLiveStateLabel(): string {
    const hasIncoming = panelItems.some((item) => item.status === 'called' || item.status === 'directed');
    const hasInRoom = panelItems.some((item) => item.status === 'in_room');
    if (hasIncoming) {
      return snapshot?.panel.calledText ?? t('roomPanel.noTickets');
    }
    if (hasInRoom) {
      return snapshot?.panel.arrivedText ?? t('roomPanel.noTickets');
    }
    return t('roomPanel.noTickets');
  }

  $effect(() => {
    if (!selectedRoomId && rooms[0]) {
      selectedRoomId = rooms[0].roomId;
    }
  });

  $effect(() => {
    const requestedRoomId = requestedRoomIdFromUrl;
    if (!requestedRoomId || loading || submitting || recoveringSession || reconcilingRoom) {
      return;
    }
    selectedRoomId = requestedRoomId;
    if (snapshot?.roomId === requestedRoomId) {
      return;
    }
    void reconcileRequestedRoom();
  });

  onMount(() => {
    const stopProfile = mountPracticeProfileSync((profile) => {
      practiceProfile = profile;
    });
    const requestedRoomId = readRequestedRoomId();
    if (requestedRoomId) {
      selectedRoomId = requestedRoomId;
    }
    void bootstrapPanel();
    return () => {
      stopProfile();
      disconnectStream?.();
    };
  });

  function readRequestedRoomId(): string {
    return requestedRoomIdFromUrl;
  }

  function resolveAutoOpenRoomId(): string | null {
    const requestedRoomId = readRequestedRoomId();
    if (requestedRoomId) {
      const room = rooms.find((entry) => entry.roomId === requestedRoomId);
      return room && !room.requiresPin ? room.roomId : null;
    }

    const pinFreeRooms = rooms.filter((entry) => !entry.requiresPin);
    return pinFreeRooms.length === 1 ? (pinFreeRooms[0]?.roomId ?? null) : null;
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

      selectedRoomId = requestedRoomId;
      const requestedRoom = rooms.find((entry) => entry.roomId === requestedRoomId);
      if (!requestedRoom) {
        errorMessage = t('roomPanel.noRoomError');
        return false;
      }

      if (snapshot?.roomId === requestedRoomId) {
        return true;
      }

      disconnectStream?.();
      disconnectStream = null;

      if (!requestedRoom.requiresPin) {
        await completeLogin(requestedRoomId);
        return snapshot?.roomId === requestedRoomId;
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
    if (!queueResult.ok) {
      return false;
    }

    const requestedRoomId = readRequestedRoomId();
    if (requestedRoomId && queueResult.data.roomId !== requestedRoomId) {
      return reconcileRequestedRoom();
    }

    snapshot = queueResult.data;
    startStream();
    return true;
  }

  function roomFromLoginRoom(room: RoomPanelRoom): PracticeRoomWithPanel {
    return {
      roomId: room.roomId,
      roomLabel: room.roomLabel,
      enabled: true,
      panel: {
        ...DEFAULT_ROOM_PANEL_SETTINGS,
        enabled: true,
        placement: room.placement,
        mode: room.mode,
      },
    };
  }

  function roomFromSnapshot(data: RoomPanelSnapshot): PracticeRoomWithPanel {
    return {
      roomId: data.roomId,
      roomLabel: data.roomLabel,
      enabled: true,
      panel: {
        ...DEFAULT_ROOM_PANEL_SETTINGS,
        enabled: true,
        placement: data.panel.placement,
        mode: data.panel.mode,
        showPatientNames: data.panel.showPatientNames,
      },
    };
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
      selectedRoomId = '';
      return true;
    }

    const urlRoomId = readRequestedRoomId();
    if (urlRoomId && result.data.rooms.some((room) => room.roomId === urlRoomId)) {
      selectedRoomId = urlRoomId;
    } else if (!result.data.rooms.some((room) => room.roomId === selectedRoomId)) {
      selectedRoomId = result.data.rooms[0].roomId;
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

    const autoOpenRoomId = resolveAutoOpenRoomId();
    if (autoOpenRoomId && !forceLoginScreen) {
      await completeLogin(autoOpenRoomId);
    }
    forceLoginScreen = false;
    loading = false;
  }

  async function refreshSnapshot() {
    const result = await fetchRoomPanelQueue();
    if (!result.ok) {
      streamError = result.error.message || t('roomPanel.queueLoadError');
      return;
    }
    snapshot = result.data;
    streamError = null;
  }

  function startStream() {
    disconnectStream?.();
    disconnectStream = connectRoomPanelQueueStream({
      onSnapshot: (data) => {
        const requestedRoomId = readRequestedRoomId();
        if (requestedRoomId && data.roomId !== requestedRoomId) {
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

  async function completeLogin(roomId: string) {
    submitting = true;
    errorMessage = null;
    streamError = null;

    const result = await loginRoomPanel({ roomId, pin: pin.trim() });
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

    await completeLogin(selectedRoom.roomId);
  }

  async function runTicketAction(item: RoomPanelItem | undefined, action: 'check_in' | 'check_out') {
    if (!item) {
      streamError = t('roomPanel.actionError');
      return;
    }

    busyVisitId = item.visitId;
    const result =
      action === 'check_in'
        ? await checkInRoomPanelVisit(item.visitId)
        : await checkOutRoomPanelVisit(item.visitId);
    busyVisitId = null;

    if (!result.ok) {
      if (result.error.status === 401 || result.error.status === 403) {
        await recoverExpiredSession(t('roomPanel.sessionExpired'));
        return;
      }
      streamError = result.error.message || t('roomPanel.actionError');
      return;
    }

    await refreshSnapshot();
  }

  function requestCheckOut(visitId: string) {
    checkOutVisit = findPanelItem(visitId) ?? null;
  }

  async function confirmCheckOut() {
    const item = checkOutVisit;
    if (!item) {
      return;
    }
    await runTicketAction(item, 'check_out');
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
    return panelItems.find((item) => item.visitId === visitId);
  }
</script>

{#if isLive && liveRoom}
  <div class="room-panel-live-shell">
    <RoomPanelPreview
      room={liveRoom}
      {queueEntries}
      state={liveState}
      stateLabelOverride={liveStateLabel}
      preview={false}
      {busyVisitId}
      onCheckIn={(visitId) => void runTicketAction(findPanelItem(visitId), 'check_in')}
      onCheckOut={requestCheckOut}
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
        bind:selectedRoomId
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
