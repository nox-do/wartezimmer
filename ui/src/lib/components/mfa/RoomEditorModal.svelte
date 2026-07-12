<script lang="ts">
  import Modal from '$lib/components/Modal.svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import type {
    PracticeRoomWithPanels,
    RoomPanelMode,
    RoomPanelPlacement,
    RoomPanelTextPreset,
  } from '$lib/queue/ops-settings-api';
  import {
    DEFAULT_ROOM_PANELS_SETTINGS,
    ROOM_PANEL_CUSTOM_TEXT_MAX_LENGTH,
    ROOM_PANEL_MODES,
    ROOM_PANEL_PLACEMENTS,
    ROOM_PANEL_TEXT_PRESETS,
    isValidRoomId,
    roomPanelConfigForPlacement,
    roomPanelsOrDefault,
  } from '$lib/queue/ops-settings-api';
  import { updateRoomPanelPlacementConfig } from '$lib/queue/room-panel-settings';
  import { normalizeMaxOccupancy } from '$lib/queue/room-capacity';
  import { normalizeRoomPanelCustomText } from '@praxis-flow/domain';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { toastStore } from '$lib/stores/toastStore';

  interface Props {
    open?: boolean;
    mode?: 'add' | 'edit';
    draft?: PracticeRoomWithPanels;
    roomIdsTaken?: Set<string>;
    canDelete?: boolean;
    busy?: boolean;
    onApply?: (draft: PracticeRoomWithPanels) => void;
    onDelete?: () => void;
    onCancel?: () => void;
  }

  let {
    open = $bindable(false),
    mode = 'add',
    draft = $bindable({
      roomId: '',
      roomLabel: '',
      enabled: true,
      defaultCallTarget: false,
      maxOccupancy: null,
      panels: { ...DEFAULT_ROOM_PANELS_SETTINGS },
    }),
    roomIdsTaken = new Set<string>(),
    canDelete = false,
    busy = false,
    onApply,
    onDelete,
    onCancel,
  }: Props = $props();

  let labelError = $state('');
  let maxOccupancyError = $state('');
  let maxOccupancyInput = $state('');
  let selectedPlacement = $state<RoomPanelPlacement>('outside');

  const modalTitle = $derived(
    mode === 'add' ? t('mfa.settings.roomModalAddTitle') : t('mfa.settings.roomModalEditTitle'),
  );
  const panelDraft = $derived(roomPanelConfigForPlacement(draft, selectedPlacement));

  $effect(() => {
    if (!open) {
      return;
    }
    maxOccupancyInput = draft.maxOccupancy == null ? '' : String(draft.maxOccupancy);
    maxOccupancyError = '';
    selectedPlacement = 'outside';
  });

  function updateLabel(roomLabel: string) {
    draft = { ...draft, roomLabel };
    labelError = '';
  }

  function roomPanelModeLabel(panelMode: RoomPanelMode): string {
    return {
      display_only: t('mfa.settings.roomPanelMode_display_only'),
      arrival:
        selectedPlacement === 'outside'
          ? t('mfa.settings.roomPanelMode_arrival_outside')
          : t('mfa.settings.roomPanelMode_arrival_inside'),
      staff_full: t('mfa.settings.roomPanelMode_staff_full'),
    }[panelMode];
  }

  function roomPanelModeGuide(): string {
    const key = `${selectedPlacement}_${panelDraft.mode}` as const;
    const guides: Record<string, string> = {
      outside_display_only: t('mfa.settings.roomPanelModeGuide_outside_display_only'),
      outside_arrival: t('mfa.settings.roomPanelModeGuide_outside_arrival'),
      inside_display_only: t('mfa.settings.roomPanelModeGuide_inside_display_only'),
      inside_arrival: t('mfa.settings.roomPanelModeGuide_inside_arrival'),
      inside_staff_full: t('mfa.settings.roomPanelModeGuide_inside_staff_full'),
    };
    return guides[key] ?? '';
  }

  function updatePanelPlacement(placement: RoomPanelPlacement) {
    selectedPlacement = placement;
  }

  function roomPanelTextPresetLabel(preset: RoomPanelTextPreset): string {
    return {
      you_are_right: t('mfa.settings.roomPanelPreset_you_are_right'),
      please_wait_here: t('mfa.settings.roomPanelPreset_please_wait_here'),
      please_enter: t('mfa.settings.roomPanelPreset_please_enter'),
      go_to_reception: t('mfa.settings.roomPanelPreset_go_to_reception'),
      custom: t('mfa.settings.roomPanelPreset_custom'),
    }[preset];
  }

  function updatePanel(patch: Partial<typeof panelDraft>) {
    draft = {
      ...draft,
      panels: updateRoomPanelPlacementConfig(roomPanelsOrDefault(draft), selectedPlacement, patch),
    };
  }

  function updateCalledTextPreset(value: string) {
    const preset = ROOM_PANEL_TEXT_PRESETS.find((candidate) => candidate === value);
    if (preset) {
      updatePanel({ calledTextPreset: preset });
    }
  }

  function updateArrivedTextPreset(value: string) {
    const preset = ROOM_PANEL_TEXT_PRESETS.find((candidate) => candidate === value);
    if (preset) {
      updatePanel({ arrivedTextPreset: preset });
    }
  }

  function validate(): boolean {
    labelError = '';
    maxOccupancyError = '';

    if (!draft.roomLabel.trim()) {
      labelError = t('mfa.settings.roomModalLabelRequired');
      return false;
    }

    const roomId = draft.roomId.trim();
    if (!isValidRoomId(roomId)) {
      toastStore.error(t('mfa.settings.roomIdInvalid'));
      return false;
    }

    if (roomIdsTaken.has(roomId)) {
      toastStore.error(t('mfa.settings.roomIdDuplicate'));
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

  function handleApply() {
    if (!validate()) {
      return;
    }
    const trimmedMax = maxOccupancyInput.trim();
    const maxOccupancy =
      trimmedMax.length > 0 ? normalizeMaxOccupancy(Number(trimmedMax)) : null;
    const panels = roomPanelsOrDefault(draft);
    onApply?.({
      roomId: draft.roomId.trim(),
      roomLabel: draft.roomLabel.trim(),
      enabled: draft.enabled,
      defaultCallTarget: draft.defaultCallTarget === true,
      maxOccupancy,
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
    });
    open = false;
  }

  function handleClose() {
    open = false;
    onCancel?.();
  }
</script>

<Modal
  bind:open
  title={modalTitle}
  headerClass="modal-header--hero bg-gradient-primary"
  maxWidth="720px"
  dimBackdrop={true}
  closeOnEscape={!busy}
  onClose={handleClose}
>
  <form
    class="modal-form"
    onsubmit={(event) => {
      event.preventDefault();
      handleApply();
    }}
  >
    <label class="modal-form-field">
      <span>{t('mfa.settings.roomLabel')}</span>
      <input
        class="form-input"
        type="text"
        value={draft.roomLabel}
        disabled={busy}
        oninput={(event) => updateLabel((event.currentTarget as HTMLInputElement).value)}
      />
      {#if labelError}
        <span class="modal-form-error">{labelError}</span>
      {/if}
    </label>

    <label class="modal-form-check">
      <input
        type="checkbox"
        checked={draft.enabled}
        disabled={busy}
        onchange={(event) => {
          const enabled = (event.currentTarget as HTMLInputElement).checked;
          draft = {
            ...draft,
            enabled,
            defaultCallTarget: enabled ? draft.defaultCallTarget : false,
          };
        }}
      />
      <span>{t('mfa.settings.roomEnabled')}</span>
    </label>

    <label class="modal-form-check">
      <input
        type="checkbox"
        checked={draft.defaultCallTarget === true}
        disabled={busy || !draft.enabled}
        onchange={(event) => {
          const defaultCallTarget = (event.currentTarget as HTMLInputElement).checked;
          draft = {
            ...draft,
            enabled: defaultCallTarget ? true : draft.enabled,
            defaultCallTarget,
          };
        }}
      />
      <span>{t('mfa.settings.roomDefaultCallTarget')}</span>
    </label>
    <p class="modal-form-hint">{t('mfa.settings.roomDefaultCallTargetHint')}</p>

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
      <p class="modal-form-hint">{t('mfa.settings.roomMaxOccupancyHint')}</p>
      {#if maxOccupancyError}
        <span class="modal-form-error">{maxOccupancyError}</span>
      {/if}
    </label>

    <fieldset class="modal-form-field room-panel-settings">
      <legend>{t('mfa.settings.roomPanelSectionTitle')}</legend>
      <p class="modal-form-hint">{t('mfa.settings.roomPanelSectionHint')}</p>

      <label class="modal-form-check">
        <input
          type="checkbox"
          checked={panelDraft.enabled}
          disabled={busy || !draft.enabled}
          onchange={(event) => updatePanel({ enabled: (event.currentTarget as HTMLInputElement).checked })}
        />
        <span>{t('mfa.settings.roomPanelEnabled')}</span>
      </label>

      <div class="modal-form-field" role="radiogroup" aria-labelledby="room-panel-placement-label">
        <span id="room-panel-placement-label">{t('mfa.settings.roomPanelPlacement')}</span>
        {#each ROOM_PANEL_PLACEMENTS as placement}
          <label class="modal-form-check">
            <input
              type="radio"
              name="room-panel-placement"
              value={placement}
              checked={selectedPlacement === placement}
              disabled={busy || !panelDraft.enabled}
              onchange={() => updatePanelPlacement(placement)}
            />
            <span>{t(`mfa.settings.roomPanelPlacement_${placement}`)}</span>
          </label>
        {/each}
        <p class="modal-form-hint">
          {selectedPlacement === 'outside'
            ? t('mfa.settings.roomPanelPlacementOutsideHint')
            : t('mfa.settings.roomPanelPlacementInsideHint')}
        </p>
      </div>

      <div class="modal-form-field" role="radiogroup" aria-labelledby="room-panel-mode-label">
        <span id="room-panel-mode-label">{t('mfa.settings.roomPanelMode')}</span>
        {#each ROOM_PANEL_MODES.filter((mode) => selectedPlacement === 'inside' || mode !== 'staff_full') as panelMode}
          <label class="modal-form-check">
            <input
              type="radio"
              name="room-panel-mode"
              value={panelMode}
              checked={panelDraft.mode === panelMode}
              disabled={busy || !panelDraft.enabled}
              onchange={() => updatePanel({ mode: panelMode })}
            />
            <span>{roomPanelModeLabel(panelMode)}</span>
          </label>
        {/each}
        {#if panelDraft.enabled}
          <p class="modal-form-hint room-panel-mode-guide">{roomPanelModeGuide()}</p>
        {/if}
      </div>

      {#if selectedPlacement === 'inside'}
        <label class="modal-form-check">
          <input
            type="checkbox"
            checked={panelDraft.showPatientNames}
            disabled={busy || !panelDraft.enabled}
            onchange={(event) => updatePanel({ showPatientNames: (event.currentTarget as HTMLInputElement).checked })}
          />
          <span>{t('mfa.settings.roomPanelShowNames')}</span>
        </label>
        <p class="modal-form-hint">{t('mfa.settings.roomPanelShowNamesHint')}</p>
      {/if}

      <div class="room-panel-settings-grid">
        <label class="modal-form-field">
          <span>{t('mfa.settings.roomPanelCalledText')}</span>
          <select
            class="form-select"
            value={panelDraft.calledTextPreset}
            disabled={busy || !panelDraft.enabled}
            onchange={(event) => updateCalledTextPreset(event.currentTarget.value)}
          >
            {#each ROOM_PANEL_TEXT_PRESETS as preset}
              <option value={preset}>{roomPanelTextPresetLabel(preset)}</option>
            {/each}
          </select>
          {#if panelDraft.calledTextPreset === 'custom'}
            <input
              class="form-input"
              type="text"
              value={panelDraft.calledTextCustom ?? ''}
              disabled={busy || !panelDraft.enabled}
              maxlength={ROOM_PANEL_CUSTOM_TEXT_MAX_LENGTH}
              placeholder={t('mfa.settings.roomPanelCustomTextPlaceholder')}
              oninput={(event) => updatePanel({ calledTextCustom: (event.currentTarget as HTMLInputElement).value })}
            />
          {/if}
        </label>

        <label class="modal-form-field">
          <span>{t('mfa.settings.roomPanelArrivedText')}</span>
          <select
            class="form-select"
            value={panelDraft.arrivedTextPreset}
            disabled={busy || !panelDraft.enabled}
            onchange={(event) => updateArrivedTextPreset(event.currentTarget.value)}
          >
            {#each ROOM_PANEL_TEXT_PRESETS as preset}
              <option value={preset}>{roomPanelTextPresetLabel(preset)}</option>
            {/each}
          </select>
          {#if panelDraft.arrivedTextPreset === 'custom'}
            <input
              class="form-input"
              type="text"
              value={panelDraft.arrivedTextCustom ?? ''}
              disabled={busy || !panelDraft.enabled}
              maxlength={ROOM_PANEL_CUSTOM_TEXT_MAX_LENGTH}
              placeholder={t('mfa.settings.roomPanelCustomTextPlaceholder')}
              oninput={(event) => updatePanel({ arrivedTextCustom: (event.currentTarget as HTMLInputElement).value })}
            />
          {/if}
        </label>
      </div>
    </fieldset>

    <div class="form-actions" class:form-actions--split={mode === 'edit' && canDelete}>
      {#if mode === 'edit' && canDelete}
        <Button type="button" variant="ghost" disabled={busy} onclick={() => onDelete?.()}>
          {t('mfa.settings.roomRemove')}
        </Button>
      {/if}
      <div class="form-actions__end">
        <Button type="button" variant="outline" disabled={busy} onclick={handleClose}>{t('ui.cancel')}</Button>
        <Button type="submit" variant="primary" disabled={busy}>{t('mfa.settings.topicModalApply')}</Button>
      </div>
    </div>
  </form>
</Modal>
