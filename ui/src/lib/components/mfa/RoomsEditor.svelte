<script lang="ts">
  import Modal from '$lib/components/Modal.svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import RoomEditorModal from '$lib/components/mfa/RoomEditorModal.svelte';
  import type {
    PracticeRoomWithPanels,
    RoomPanelMode,
    RoomPanelPlacement,
    RoomPanelTextPreset,
  } from '$lib/queue/ops-settings-api';
  import {
    ROOM_PANEL_CUSTOM_TEXT_MAX_LENGTH,
    ROOM_PANEL_MODES,
    ROOM_PANEL_TEXT_PRESETS,
    ensureSingleDefaultCallTarget,
    listEnabledRoomPanelPlacements,
    roomPanelConfigForPlacement,
    roomPanelsOrDefault,
  } from '$lib/queue/ops-settings-api';
  import {
    isReservedRoomLabel,
    WAITING_ROOM_LOCATION_ID,
    updateRoomPanelPlacementConfig,
  } from '@praxis-flow/domain';
  import { roomPanelPresetOptionLabel } from '$lib/room-panel/room-panel-text';
  import { getDevicePresenceStatus } from '$lib/mfa/ops-stream-store.svelte';
  import { roomPanelDeviceId, type DevicePresenceStatus } from '$lib/ops/device-presence-api';
  import { normalizeMaxOccupancy } from '$lib/queue/room-capacity';
  import type { RoomQueueGuardContext } from '$lib/queue/room-removal-guard';
  import { normalizeRoomPanelCustomText } from '@praxis-flow/domain';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';

  interface Props {
    rooms: PracticeRoomWithPanels[];
    postWaitingCallTargetId?: string | null;
    showPostWaitingCallTarget?: boolean;
    busy?: boolean;
    onChange?: (rooms: PracticeRoomWithPanels[]) => void;
    onPostWaitingCallTargetChange?: (roomId: string | null) => void;
    onPersist?: (options?: { roomQueueGuardContext?: RoomQueueGuardContext }) => void | Promise<boolean>;
  }

  let {
    rooms,
    postWaitingCallTargetId = null,
    showPostWaitingCallTarget = false,
    busy = false,
    onChange,
    onPostWaitingCallTargetChange,
    onPersist,
  }: Props = $props();

  let openRoomId = $state<string | null>(null);
  let draft = $state<PracticeRoomWithPanels | null>(null);
  let lastSyncedRoomJson = $state('');
  let maxOccupancyInput = $state('');
  let labelError = $state('');
  let maxOccupancyError = $state('');

  let addModalOpen = $state(false);
  let deleteConfirmOpen = $state(false);
  let deleteTargetIndex = $state<number | null>(null);

  const editingIndex = $derived(
    openRoomId == null ? -1 : rooms.findIndex((room) => room.roomId === openRoomId),
  );
  const waitingRoomIsDefault = $derived(
    !rooms.some((room) => room.enabled && room.defaultCallTarget),
  );
  const enabledRooms = $derived(rooms.filter((room) => room.enabled));

  $effect(() => {
    if (openRoomId == null) {
      return;
    }
    const saved = rooms.find((room) => room.roomId === openRoomId);
    if (!saved) {
      closeExpander();
      return;
    }
    const savedJson = JSON.stringify(saved);
    if (savedJson !== lastSyncedRoomJson) {
      lastSyncedRoomJson = savedJson;
      draft = $state.snapshot(saved);
      maxOccupancyInput = saved.maxOccupancy == null ? '' : String(saved.maxOccupancy);
    }
  });

  function closeExpander() {
    openRoomId = null;
    draft = null;
    lastSyncedRoomJson = '';
    maxOccupancyInput = '';
    labelError = '';
    maxOccupancyError = '';
  }

  function toggleExpander(roomId: string) {
    if (openRoomId === roomId) {
      closeExpander();
      return;
    }
    const saved = rooms.find((room) => room.roomId === roomId);
    if (!saved) {
      return;
    }
    openRoomId = roomId;
    draft = $state.snapshot(saved);
    lastSyncedRoomJson = JSON.stringify(saved);
    maxOccupancyInput = saved.maxOccupancy == null ? '' : String(saved.maxOccupancy);
    labelError = '';
    maxOccupancyError = '';
  }

  function openAddModal() {
    addModalOpen = true;
  }

  async function applyAddRoom(next: PracticeRoomWithPanels) {
    const updated = ensureSingleDefaultCallTarget([...rooms, next], null);
    onChange?.(updated);
    const ok = await onPersist?.();
    if (ok === false) {
      return;
    }
    openRoomId = next.roomId;
    draft = $state.snapshot(next);
    lastSyncedRoomJson = JSON.stringify(next);
    maxOccupancyInput = '';
    labelError = '';
    maxOccupancyError = '';
  }

  async function setWaitingRoomAsDefault() {
    if (waitingRoomIsDefault) return;
    onChange?.(ensureSingleDefaultCallTarget(rooms, WAITING_ROOM_LOCATION_ID));
    await onPersist?.();
  }

  async function setPostWaitingCallTarget(value: string) {
    onPostWaitingCallTargetChange?.(value.trim() || null);
    await onPersist?.();
  }

  function roomQueueGuardContextForSave(
    previous: PracticeRoomWithPanels,
    next: PracticeRoomWithPanels,
  ): RoomQueueGuardContext | undefined {
    if (next.roomId !== previous.roomId) {
      return 'remove';
    }
    if (!next.enabled && previous.enabled) {
      return 'disable';
    }
    return undefined;
  }

  function normalizeDraftForSave(source: PracticeRoomWithPanels): PracticeRoomWithPanels {
    const panels = roomPanelsOrDefault(source);
    return {
      roomId: source.roomId.trim(),
      roomLabel: source.roomLabel.trim(),
      enabled: source.enabled,
      defaultCallTarget: source.defaultCallTarget === true,
      maxOccupancy: source.maxOccupancy,
      panels: {
        outside: {
          ...panels.outside,
          calledTextCustom: normalizeRoomPanelCustomText(panels.outside.calledTextCustom),
          arrivedTextCustom: normalizeRoomPanelCustomText(panels.outside.arrivedTextCustom),
        },
        inside: {
          ...panels.inside,
          calledTextCustom: normalizeRoomPanelCustomText(panels.inside.calledTextCustom),
          arrivedTextCustom: normalizeRoomPanelCustomText(panels.inside.arrivedTextCustom),
        },
      },
    };
  }

  function validateDraft(): boolean {
    if (!draft) {
      return false;
    }
    labelError = '';
    maxOccupancyError = '';

    if (!draft.roomLabel.trim()) {
      labelError = t('mfa.settings.roomModalLabelRequired');
      return false;
    }
    if (isReservedRoomLabel(draft.roomLabel)) {
      labelError = t('mfa.settings.roomLabelReserved');
      return false;
    }

    const trimmedMax = maxOccupancyInput.trim();
    if (trimmedMax.length > 0) {
      const parsed = Number(trimmedMax);
      if (!Number.isInteger(parsed) || parsed < 1) {
        maxOccupancyError = t('mfa.settings.roomMaxOccupancyInvalid');
        return false;
      }
    }

    return true;
  }

  async function saveDraft() {
    if (!draft || editingIndex < 0) {
      return;
    }
    if (!validateDraft()) {
      return;
    }

    const trimmedMax = maxOccupancyInput.trim();
    const maxOccupancy =
      trimmedMax.length > 0 ? normalizeMaxOccupancy(Number(trimmedMax)) : null;

    const next = normalizeDraftForSave({
      ...draft,
      maxOccupancy,
    });

    const previous = rooms[editingIndex];
    const roomQueueGuardContext = previous ? roomQueueGuardContextForSave(previous, next) : undefined;
    const preferredDefaultId = next.defaultCallTarget ? next.roomId : null;
    const updated = ensureSingleDefaultCallTarget(
      rooms.map((room, index) => (index === editingIndex ? next : room)),
      preferredDefaultId,
    );

    onChange?.(updated);
    const ok = await onPersist?.(roomQueueGuardContext ? { roomQueueGuardContext } : undefined);
    if (ok === false) {
      return;
    }
    lastSyncedRoomJson = JSON.stringify(next);
  }

  function requestDelete(roomId: string) {
    if (rooms.length <= 1) {
      return;
    }
    deleteTargetIndex = rooms.findIndex((room) => room.roomId === roomId);
    if (deleteTargetIndex < 0) return;
    deleteConfirmOpen = true;
  }

  async function confirmDelete() {
    if (deleteTargetIndex == null || rooms.length <= 1) {
      deleteConfirmOpen = false;
      deleteTargetIndex = null;
      return;
    }
    const removed = rooms[deleteTargetIndex];
    if (!removed) {
      deleteConfirmOpen = false;
      deleteTargetIndex = null;
      return;
    }

    if (openRoomId === removed.roomId) {
      closeExpander();
    }

    onChange?.(ensureSingleDefaultCallTarget(rooms.filter((_, index) => index !== deleteTargetIndex)));
    deleteConfirmOpen = false;
    deleteTargetIndex = null;
    await onPersist?.({ roomQueueGuardContext: 'remove' });
  }

  function updateDraft(patch: Partial<PracticeRoomWithPanels>) {
    if (!draft) {
      return;
    }
    draft = { ...draft, ...patch };
  }

  function updateDraftPanel(placement: RoomPanelPlacement, patch: Parameters<typeof updateRoomPanelPlacementConfig>[2]) {
    if (!draft) {
      return;
    }
    draft = {
      ...draft,
      panels: updateRoomPanelPlacementConfig(roomPanelsOrDefault(draft), placement, patch),
    };
  }

  function roomPanelModeLabel(placement: RoomPanelPlacement, panelMode: RoomPanelMode): string {
    if (panelMode === 'arrival') {
      return placement === 'outside'
        ? t('mfa.settings.roomPanelMode_arrival_outside')
        : t('mfa.settings.roomPanelMode_arrival_inside');
    }
    return {
      display_only: t('mfa.settings.roomPanelMode_display_only'),
      staff_full: t('mfa.settings.roomPanelMode_staff_full'),
    }[panelMode];
  }

  function roomPanelModeGuide(placement: RoomPanelPlacement, panelMode: RoomPanelMode): string {
    const key = `${placement}_${panelMode}` as const;
    const guides: Record<string, string> = {
      outside_display_only: t('mfa.settings.roomPanelModeGuide_outside_display_only'),
      outside_arrival: t('mfa.settings.roomPanelModeGuide_outside_arrival'),
      inside_display_only: t('mfa.settings.roomPanelModeGuide_inside_display_only'),
      inside_arrival: t('mfa.settings.roomPanelModeGuide_inside_arrival'),
      inside_staff_full: t('mfa.settings.roomPanelModeGuide_inside_staff_full'),
    };
    return guides[key] ?? '';
  }

  function roomPanelTextPresetLabel(preset: RoomPanelTextPreset): string {
    return roomPanelPresetOptionLabel(preset, t);
  }

  function panelModesForPlacement(placement: RoomPanelPlacement): readonly RoomPanelMode[] {
    return placement === 'outside'
      ? ROOM_PANEL_MODES.filter((mode) => mode !== 'staff_full')
      : ROOM_PANEL_MODES;
  }

  function roomPanelPresenceLabel(placement: RoomPanelPlacement, status: DevicePresenceStatus): string {
    const placementLabel = t(`mfa.settings.roomPanelPlacementShort_${placement}`);
    const statusKey = status === 'online' ? 'online' : status === 'stale' ? 'stale' : 'offline';
    return tf(`mfa.settings.roomPanelPresence_${statusKey}`, { placement: placementLabel });
  }

  function presencePillClass(status: DevicePresenceStatus): string {
    if (status === 'online') {
      return 'pill--on';
    }
    if (status === 'stale') {
      return 'pill--warn';
    }
    return 'pill--off';
  }

  function roomCapacityLabel(room: PracticeRoomWithPanels): string {
    if (room.maxOccupancy == null) {
      return t('mfa.settings.roomCapacityUnlimited');
    }
    return tf('mfa.settings.roomCapacityLimited', { count: room.maxOccupancy });
  }

  function panelSummary(room: PracticeRoomWithPanels, placement: RoomPanelPlacement): string {
    const panel = roomPanelConfigForPlacement(room, placement);
    const short = t(`mfa.settings.roomPanelPlacementShort_${placement}`);
    return `${short}: ${roomPanelModeLabel(placement, panel.mode)}`;
  }

  const PANEL_PLACEMENTS: RoomPanelPlacement[] = ['outside', 'inside'];
</script>

<div class="panel rooms-editor-panel">
  <div class="mfa-editor-head">
    <div>
      <h2 class="panel__title">{t('mfa.settings.roomsPanelTitle')}</h2>
      <p class="text-desc">{t('mfa.settings.roomsPanelDesc')}</p>
    </div>
    <Button variant="outline" size="sm" disabled={busy} onclick={openAddModal}>
      {t('mfa.settings.roomAdd')}
    </Button>
  </div>

  <div class="rooms-editor-default-routing">
    <label class="modal-form-check rooms-editor-default-target">
      <input
        type="checkbox"
        checked={waitingRoomIsDefault}
        disabled={busy}
        onchange={(event) => {
          const input = event.currentTarget as HTMLInputElement;
          if (input.checked) {
            void setWaitingRoomAsDefault();
          } else {
            input.checked = true;
          }
        }}
      />
      <span class="rooms-editor-default-target__text">
        <span>{t('mfa.settings.waitingRoomDefaultTarget')}</span>
        <small>{t('mfa.settings.waitingRoomDefaultTargetHint')}</small>
      </span>
    </label>

    {#if showPostWaitingCallTarget}
      <label class="modal-form-field rooms-editor-post-waiting-target">
        <span>{t('mfa.settings.postWaitingCallTarget')}</span>
        <select
          class="form-input"
          value={postWaitingCallTargetId ?? ''}
          disabled={busy || !waitingRoomIsDefault}
          onchange={(event) =>
            void setPostWaitingCallTarget((event.currentTarget as HTMLSelectElement).value)}
        >
          <option value="" disabled>{t('mfa.settings.postWaitingCallTargetPlaceholder')}</option>
          {#each enabledRooms as room (room.roomId)}
            <option value={room.roomId}>{room.roomLabel}</option>
          {/each}
        </select>
      </label>
    {/if}
  </div>

  {#if rooms.length === 0}
    <p class="mfa-editor-empty">{t('mfa.settings.roomsEmpty')}</p>
  {:else}
    <ul class="room-expander-list" role="list">
      {#each rooms as room (`room-expander-${room.roomId}`)}
        {@const isOpen = openRoomId === room.roomId}
        {@const enabledPlacements = listEnabledRoomPanelPlacements(room)}
        <li
          class="room-expander"
          class:is-open={isOpen}
          class:room-expander--inactive={!room.enabled}
          role="listitem"
        >
          <button
            type="button"
            class="room-expander__trigger"
            aria-expanded={isOpen}
            disabled={busy}
            onclick={() => toggleExpander(room.roomId)}
          >
            <span class="room-expander__icon" aria-hidden="true">⌂</span>
            <span class="room-expander__summary">
              <span class="room-expander__label">
                {room.roomLabel.trim() || t('mfa.settings.roomDefaultLabel')}
              </span>
              <span class="room-expander__meta">
                {roomCapacityLabel(room)}
                {#if enabledPlacements.length > 0}
                  · {enabledPlacements.map((placement) => panelSummary(room, placement)).join(' · ')}
                {/if}
              </span>
            </span>
            <span class="room-expander__badges">
              {#if room.defaultCallTarget && room.enabled}
                <span class="pill pill--info">{t('mfa.settings.roomDefaultCallTargetBadge')}</span>
              {/if}
              {#each PANEL_PLACEMENTS as placement (`${room.roomId}:header:${placement}`)}
                {@const panel = roomPanelConfigForPlacement(room, placement)}
                {#if panel.enabled}
                  {@const panelStatus = getDevicePresenceStatus(roomPanelDeviceId(room.roomId, placement))}
                  <span class="pill {presencePillClass(panelStatus)}">
                    {roomPanelPresenceLabel(placement, panelStatus)}
                  </span>
                {/if}
              {/each}
              {#if !room.enabled}
                <span class="pill pill--caps">{t('mfa.settings.roomInactive')}</span>
              {/if}
            </span>
            <span class="room-expander__chevron" aria-hidden="true">⌄</span>
          </button>

          {#if isOpen && draft}
            {@const roomDraft = draft}
            <div class="room-expander__panel">
              <form
                class="room-expander-form"
                onsubmit={(event) => {
                  event.preventDefault();
                  void saveDraft();
                }}
              >
                <section class="room-expander-section room-expander-section--room">
                  <div class="room-expander-basics-grid">
                    <label class="modal-form-field">
                      <span>{t('mfa.settings.roomLabel')}</span>
                      <input
                        class="form-input"
                        type="text"
                        value={roomDraft.roomLabel}
                        disabled={busy}
                        oninput={(event) => {
                          updateDraft({ roomLabel: (event.currentTarget as HTMLInputElement).value });
                          labelError = '';
                        }}
                      />
                      {#if labelError}
                        <span class="modal-form-error">{labelError}</span>
                      {/if}
                    </label>

                    <label class="modal-form-field">
                      <span>{t('mfa.settings.roomMaxOccupancy')}</span>
                      <input
                        class="form-input"
                        type="number"
                        min="1"
                        step="1"
                        inputmode="numeric"
                        value={maxOccupancyInput}
                        disabled={busy}
                        placeholder={t('mfa.settings.roomCapacityUnlimited')}
                        oninput={(event) => {
                          maxOccupancyInput = (event.currentTarget as HTMLInputElement).value;
                          maxOccupancyError = '';
                        }}
                      />
                      {#if maxOccupancyError}
                        <span class="modal-form-error">{maxOccupancyError}</span>
                      {/if}
                    </label>
                  </div>

                  <div class="room-expander-checks">
                    <label class="modal-form-check">
                      <input
                        type="checkbox"
                        checked={roomDraft.enabled}
                        disabled={busy}
                        onchange={(event) => {
                          const enabled = (event.currentTarget as HTMLInputElement).checked;
                          updateDraft({
                            enabled,
                            defaultCallTarget: enabled ? roomDraft.defaultCallTarget : false,
                          });
                        }}
                      />
                      <span>{t('mfa.settings.roomEnabled')}</span>
                    </label>

                    <label class="modal-form-check">
                      <input
                        type="checkbox"
                        checked={roomDraft.defaultCallTarget === true}
                        disabled={busy || !roomDraft.enabled}
                        onchange={(event) => {
                          const defaultCallTarget = (event.currentTarget as HTMLInputElement).checked;
                          updateDraft({
                            enabled: defaultCallTarget ? true : roomDraft.enabled,
                            defaultCallTarget,
                          });
                        }}
                      />
                      <span>{t('mfa.settings.roomDefaultCallTarget')}</span>
                    </label>
                  </div>
                  <p class="field-hint">{t('mfa.settings.roomBasicsEnabledHint')}</p>
                  <p class="field-hint">{t('mfa.settings.roomDefaultCallTargetHint')}</p>
                </section>

                {#each PANEL_PLACEMENTS as placement (`${roomDraft.roomId}:panel:${placement}`)}
                  {@const panel = roomPanelConfigForPlacement(roomDraft, placement)}
                  {@const savedPanel = roomPanelConfigForPlacement(room, placement)}
                  {@const panelStatus = getDevicePresenceStatus(roomPanelDeviceId(roomDraft.roomId, placement))}
                  <section class="room-expander-section">
                    <div class="room-expander-section__head">
                      <h3 class="room-expander-section__title">
                        {placement === 'outside'
                          ? t('mfa.settings.roomPanelSectionOutside')
                          : t('mfa.settings.roomPanelSectionInside')}
                      </h3>
                      {#if panel.enabled}
                        <span class="pill {presencePillClass(panelStatus)}">
                          {roomPanelPresenceLabel(placement, panelStatus)}
                        </span>
                      {/if}
                    </div>

                    <label class="modal-form-check">
                      <input
                        type="checkbox"
                        checked={panel.enabled}
                        disabled={busy || !roomDraft.enabled}
                        onchange={(event) =>
                          updateDraftPanel(placement, {
                            enabled: (event.currentTarget as HTMLInputElement).checked,
                          })}
                      />
                      <span>{t('mfa.settings.roomPanelEnabled')}</span>
                    </label>
                    {#if savedPanel.enabled && !panel.enabled}
                      <p class="field-hint">{t('mfa.settings.roomPanelDisableHint')}</p>
                    {:else if panel.enabled}
                      <p class="field-hint">{t('mfa.settings.roomPanelLiveConfigHint')}</p>
                    {/if}

                    {#if placement === 'inside' && panel.enabled}
                      <p class="field-hint">{t('mfa.settings.roomPanelInsidePinHint')}</p>
                    {/if}

                    {#if panel.enabled}
                      <div class="modal-form-field">
                        <span id="room-panel-mode-{placement}">{t('mfa.settings.roomPanelMode')}</span>
                        <div
                          class="segmented-control segmented-control--journey"
                          role="radiogroup"
                          aria-labelledby="room-panel-mode-{placement}"
                        >
                          {#each panelModesForPlacement(placement) as panelMode (`${placement}:${panelMode}`)}
                            <button
                              type="button"
                              class="segmented-control__option"
                              role="radio"
                              aria-checked={panel.mode === panelMode}
                              disabled={busy}
                              onclick={() =>
                                updateDraftPanel(placement, {
                                  mode: panelMode,
                                  ...(placement === 'inside' && panelMode !== 'staff_full'
                                    ? { allowCalling: false }
                                    : {}),
                                })}
                            >
                              {roomPanelModeLabel(placement, panelMode)}
                            </button>
                          {/each}
                        </div>
                        <p class="field-hint">{roomPanelModeGuide(placement, panel.mode)}</p>
                      </div>

                      {#if placement === 'inside'}
                        <label class="modal-form-check">
                          <input
                            type="checkbox"
                            checked={panel.showPatientNames}
                            disabled={busy}
                            onchange={(event) =>
                              updateDraftPanel(placement, {
                                showPatientNames: (event.currentTarget as HTMLInputElement).checked,
                              })}
                          />
                          <span>{t('mfa.settings.roomPanelShowNames')}</span>
                        </label>
                        <p class="field-hint">{t('mfa.settings.roomPanelShowNamesHint')}</p>

                        {#if panel.mode === 'staff_full'}
                          <label class="modal-form-check">
                            <input
                              type="checkbox"
                              checked={panel.allowCalling}
                              disabled={busy}
                              onchange={(event) =>
                                updateDraftPanel(placement, {
                                  allowCalling: (event.currentTarget as HTMLInputElement).checked,
                                })}
                            />
                            <span>{t('mfa.settings.roomPanelAllowCalling')}</span>
                          </label>
                          <p class="field-hint">{t('mfa.settings.roomPanelAllowCallingHint')}</p>
                        {/if}
                      {/if}

                      <div class="room-panel-settings-grid">
                        <label class="modal-form-field">
                          <span>{t('mfa.settings.roomPanelCalledText')}</span>
                          <select
                            class="form-select"
                            value={panel.calledTextPreset}
                            disabled={busy}
                            onchange={(event) => {
                              const preset = ROOM_PANEL_TEXT_PRESETS.find(
                                (candidate) => candidate === event.currentTarget.value,
                              );
                              if (preset) {
                                updateDraftPanel(placement, { calledTextPreset: preset });
                              }
                            }}
                          >
                            {#each ROOM_PANEL_TEXT_PRESETS as preset (preset)}
                              <option value={preset}>{roomPanelTextPresetLabel(preset)}</option>
                            {/each}
                          </select>
                          <p class="field-hint">{t('mfa.settings.roomPanelCalledTextHint')}</p>
                          {#if panel.calledTextPreset === 'custom'}
                            <input
                              class="form-input"
                              type="text"
                              value={panel.calledTextCustom ?? ''}
                              disabled={busy}
                              maxlength={ROOM_PANEL_CUSTOM_TEXT_MAX_LENGTH}
                              placeholder={t('mfa.settings.roomPanelCustomTextPlaceholder')}
                              oninput={(event) =>
                                updateDraftPanel(placement, {
                                  calledTextCustom: (event.currentTarget as HTMLInputElement).value,
                                })}
                            />
                          {/if}
                        </label>

                        <label class="modal-form-field">
                          <span>{t('mfa.settings.roomPanelArrivedText')}</span>
                          <select
                            class="form-select"
                            value={panel.arrivedTextPreset}
                            disabled={busy}
                            onchange={(event) => {
                              const preset = ROOM_PANEL_TEXT_PRESETS.find(
                                (candidate) => candidate === event.currentTarget.value,
                              );
                              if (preset) {
                                updateDraftPanel(placement, { arrivedTextPreset: preset });
                              }
                            }}
                          >
                            {#each ROOM_PANEL_TEXT_PRESETS as preset (preset)}
                              <option value={preset}>{roomPanelTextPresetLabel(preset)}</option>
                            {/each}
                          </select>
                          <p class="field-hint">{t('mfa.settings.roomPanelArrivedTextHint')}</p>
                          {#if panel.arrivedTextPreset === 'custom'}
                            <input
                              class="form-input"
                              type="text"
                              value={panel.arrivedTextCustom ?? ''}
                              disabled={busy}
                              maxlength={ROOM_PANEL_CUSTOM_TEXT_MAX_LENGTH}
                              placeholder={t('mfa.settings.roomPanelCustomTextPlaceholder')}
                              oninput={(event) =>
                                updateDraftPanel(placement, {
                                  arrivedTextCustom: (event.currentTarget as HTMLInputElement).value,
                                })}
                            />
                          {/if}
                        </label>
                      </div>
                    {/if}
                  </section>
                {/each}

                <div class="form-actions">
                  <div class="form-actions__end">
                    {#if rooms.length > 1}
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        onclick={() => requestDelete(room.roomId)}
                      >
                        {t('mfa.settings.roomRemove')}
                      </Button>
                    {/if}
                    <Button type="submit" variant="primary" size="sm" disabled={busy}>
                      {t('mfa.settings.roomExpanderSave')}
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<RoomEditorModal
  bind:open={addModalOpen}
  roomIdsTaken={new Set(rooms.map((room) => room.roomId))}
  {busy}
  onApply={(room) => void applyAddRoom(room)}
/>

<Modal
  bind:open={deleteConfirmOpen}
  title={t('mfa.settings.roomDeleteConfirmTitle')}
  maxWidth="480px"
  dimBackdrop={true}
  closeOnEscape={!busy}
  onClose={() => {
    deleteConfirmOpen = false;
    deleteTargetIndex = null;
  }}
>
  <p class="modal-form-hint">{t('mfa.settings.roomDeleteConfirmBody')}</p>
  <div class="form-actions">
    <div class="form-actions__end">
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onclick={() => {
          deleteConfirmOpen = false;
          deleteTargetIndex = null;
        }}
      >
        {t('ui.cancel')}
      </Button>
      <Button type="button" variant="danger" disabled={busy} onclick={() => void confirmDelete()}>
        {t('mfa.settings.roomRemove')}
      </Button>
    </div>
  </div>
</Modal>
