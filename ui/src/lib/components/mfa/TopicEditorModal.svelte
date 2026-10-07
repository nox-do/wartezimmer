<script lang="ts">
  import ChoiceField from '$lib/components/forms/ChoiceField.svelte';
  import FormField from '$lib/components/forms/FormField.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import TopicIconDisplay from '$lib/components/topics/TopicIconDisplay.svelte';
  import TopicAccentPicker from '$lib/components/mfa/TopicAccentPicker.svelte';
  import TopicIconPickerModal from '$lib/components/mfa/TopicIconPickerModal.svelte';
  import TopicLaneBadge from '$lib/components/topics/TopicLaneBadge.svelte';
  import type { RoutingCapabilities } from '$lib/mfa/practice-ops-api';
  import type { JourneyTemplateSetting } from '$lib/ops/openapi-types';
  import type { PracticeRoom, PracticeTopicSetting } from '$lib/queue/ops-settings-api';
  import { slugifyTopicId } from '$lib/queue/ops-settings-api';
  import { isReservedLaneCode } from '$lib/queue/topic-settings-form';
  import { isValidLaneCode, WAITING_ROOM_LABEL, WAITING_ROOM_LOCATION_ID } from '@wartezimmer/domain';
  import { validateTopicTimeWindow } from '$lib/queue/time-of-day';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';
  import type { TopicIconId } from '$lib/topics/topic-icon-catalog';
  import { DEFAULT_TOPIC_ACCENT } from '$lib/topics/topic-accent';

  interface Props {
    open?: boolean;
    mode?: 'add' | 'edit';
    draft?: PracticeTopicSetting;
    enabledRooms?: PracticeRoom[];
    journeyTemplates?: JourneyTemplateSetting[];
    routingCapabilities?: RoutingCapabilities | null;
    autoSyncTopicId?: boolean;
    topicIdsTaken?: Set<string>;
    canDelete?: boolean;
    busy?: boolean;
    onApply?: (draft: PracticeTopicSetting) => void;
    onDelete?: () => void;
    onCancel?: () => void;
  }

  let {
    open = $bindable(false),
    mode = 'add',
    draft = $bindable({
      topicId: '',
      label: '',
      laneCode: 'A',
      defaultRoomId: '',
      iconId: null,
      accentColor: DEFAULT_TOPIC_ACCENT,
      enabled: true,
      availableFrom: null,
      availableTo: null,
      sortOrder: 1,
    }),
    enabledRooms = [],
    journeyTemplates = [],
    routingCapabilities = null,
    autoSyncTopicId = true,
    topicIdsTaken = new Set<string>(),
    canDelete = false,
    busy = false,
    onApply,
    onDelete,
    onCancel,
  }: Props = $props();

  let iconPickerOpen = $state(false);
  let labelError = $state('');
  let laneError = $state('');
  let roomError = $state('');
  let timeWindowError = $state('');

  const modalTitle = $derived(
    mode === 'add' ? t('mfa.settings.topicModalAddTitle') : t('mfa.settings.topicModalEditTitle'),
  );
  const routingMode = $derived(routingCapabilities?.routingMode ?? 'simple');
  const complexRoutingVisible = $derived(
    routingCapabilities?.features.complexRouting === true && routingMode === 'complex',
  );
  const draftJourneyTemplateId = $derived(draft.journeyTemplateId ?? null);
  const topicUsesJourney = $derived(complexRoutingVisible && Boolean(draftJourneyTemplateId));
  const showSimpleRoutingSection = $derived(!topicUsesJourney);
  const showComplexRoutingSection = $derived(complexRoutingVisible);
  const journeySelectOptions = $derived.by(() => {
    const active = journeyTemplates.filter((template) => template.active);
    const currentId = draft.journeyTemplateId;
    if (currentId && !active.some((template) => template.id === currentId)) {
      const current = journeyTemplates.find((template) => template.id === currentId);
      if (current) {
        return [...active, current];
      }
    }
    return active;
  });

  function updateLabel(label: string) {
    const patch: Partial<PracticeTopicSetting> = { label };
    if (autoSyncTopicId) {
      patch.topicId = slugifyTopicId(label, topicIdsTaken);
    }
    draft = { ...draft, ...patch };
    labelError = '';
  }

  function validate(): boolean {
    // UX-only precheck — server `validateTopicSettings` remains authoritative.
    labelError = '';
    laneError = '';
    roomError = '';
    timeWindowError = '';

    if (!draft.label.trim()) {
      labelError = t('mfa.settings.topicModalLabelRequired');
      return false;
    }

    const lane = draft.laneCode.trim().toUpperCase();
    if (!isValidLaneCode(lane)) {
      laneError = t('mfa.settings.topicModalLaneRequired');
      return false;
    }
    if (isReservedLaneCode(lane)) {
      laneError = t('mfa.settings.topicsLaneReserved');
      return false;
    }

    if (
      showSimpleRoutingSection &&
      draft.defaultRoomId !== WAITING_ROOM_LOCATION_ID &&
      !enabledRooms.some((room) => room.roomId === draft.defaultRoomId && room.enabled)
    ) {
      roomError = t('mfa.settings.topicNoActiveRoom');
      return false;
    }

    const timeWindow = validateTopicTimeWindow(draft.availableFrom, draft.availableTo);
    if (!timeWindow.ok) {
      if (timeWindow.code === 'incomplete') {
        timeWindowError = t('mfa.settings.topicTimeWindowIncomplete');
      } else {
        timeWindowError = tf('mfa.settings.topicTimeInvalid', { value: timeWindow.value });
      }
      return false;
    }

    return true;
  }

  function handleApply() {
    if (!validate()) {
      return;
    }
    onApply?.({
      ...draft,
      label: draft.label.trim(),
      laneCode: draft.laneCode.trim().toUpperCase().slice(0, 1),
      accentColor: draft.accentColor,
      defaultRoomId: draft.defaultRoomId.trim(),
      journeyTemplateId: draft.journeyTemplateId ?? null,
      availableFrom: draft.availableFrom?.trim() || null,
      availableTo: draft.availableTo?.trim() || null,
    });
    open = false;
  }

  function handleClose() {
    open = false;
    onCancel?.();
  }

  function handleIconSelect(iconId: TopicIconId | null) {
    draft = { ...draft, iconId };
  }
</script>

<Modal
  bind:open
  title={modalTitle}
  headerClass="modal-header--hero bg-gradient-primary"
  maxWidth="520px"
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
    <FormField label={t('mfa.settings.colTopic')} error={labelError}>
      {#snippet children(field)}
        <input
          {...field}
          class="form-input"
          type="text"
          value={draft.label}
          placeholder={t('mfa.settings.topicDefaultLabel')}
          disabled={busy}
          oninput={(event) => updateLabel((event.currentTarget as HTMLInputElement).value)}
        />
      {/snippet}
    </FormField>

    <ChoiceField label={t('mfa.settings.colEnabled')} class="topic-editor-active-check">
      <input
        type="checkbox"
        checked={draft.enabled}
        disabled={busy}
        onchange={(event) =>
          (draft = { ...draft, enabled: (event.currentTarget as HTMLInputElement).checked })}
      />
    </ChoiceField>

    <div class="modal-form-field">
      <span>{t('mfa.settings.colIcon')}</span>
      <button
        type="button"
        class="modal-form-icon-btn"
        disabled={busy}
        aria-label={t('mfa.settings.topicIconChoose')}
        onclick={() => {
          iconPickerOpen = true;
        }}
      >
        <TopicIconDisplay iconId={draft.iconId} label={draft.label} size={24} accentColor={draft.accentColor} />
        <span>{t('mfa.settings.topicIconChoose')}</span>
      </button>
    </div>

    <FormField label={t('mfa.settings.colLaneCode')} error={laneError}>
      {#snippet children(field)}
        <div class="modal-form-lane-row">
          <TopicLaneBadge laneCode={draft.laneCode} accentColor={draft.accentColor} />
          <input
            {...field}
            class="form-input modal-form-lane"
            type="text"
            maxlength="1"
            value={draft.laneCode}
            disabled={busy}
            oninput={(event) => {
              draft = { ...draft, laneCode: (event.currentTarget as HTMLInputElement).value.toUpperCase() };
              laneError = '';
            }}
          />
        </div>
      {/snippet}
    </FormField>

    <div class="modal-form-field">
      <span>{t('mfa.settings.colAccentColor')}</span>
      <TopicAccentPicker
        value={draft.accentColor}
        disabled={busy}
        onChange={(accentColor) => {
          draft = { ...draft, accentColor };
        }}
      />
    </div>

    <fieldset class="modal-form-field modal-form-routing">
      <legend>{t('mfa.settings.topicRoutingTitle')}</legend>

      {#if showSimpleRoutingSection}
        <FormField label={t('mfa.settings.colDefaultRoom')} hint={draft.defaultRoomId === WAITING_ROOM_LOCATION_ID
              ? t('mfa.settings.topicWaitingRoomHint')
              : t('mfa.settings.topicPracticeRoomHint')} error={roomError}>
          {#snippet children(field)}
            <select
              {...field}
              class="form-input"
              value={draft.defaultRoomId}
              disabled={busy}
              onchange={(event) => {
                draft = { ...draft, defaultRoomId: (event.currentTarget as HTMLSelectElement).value };
                roomError = '';
              }}
            >
              <option value={WAITING_ROOM_LOCATION_ID}>{WAITING_ROOM_LABEL}</option>
              {#each enabledRooms as room (room.roomId)}
                <option value={room.roomId}>{room.roomLabel}</option>
              {/each}
            </select>
          {/snippet}
        </FormField>
      {/if}

      {#if showComplexRoutingSection}
        <FormField label={t('mfa.settings.topicJourneySelect')} hint={!draftJourneyTemplateId ? (t('mfa.settings.topicJourneyFallbackHint')) : undefined}>
          {#snippet children(field)}
            <select
              {...field}
              class="form-input"
              disabled={busy}
              value={draftJourneyTemplateId ?? ''}
              onchange={(event) => {
                const value = (event.currentTarget as HTMLSelectElement).value;
                draft = {
                  ...draft,
                  journeyTemplateId: value.length > 0 ? value : null,
                };
              }}
            >
              <option value="">{t('mfa.settings.topicJourneySelectNone')}</option>
              {#each journeySelectOptions as template (template.id)}
                <option value={template.id}>{template.name}</option>
              {/each}
            </select>
          {/snippet}
        </FormField>
      {/if}
    </fieldset>

    <fieldset class="modal-form-field">
      <legend>{t('mfa.settings.colTimeWindow')}</legend>
      <p class="modal-form-hint">{t('mfa.settings.topicModalTimeHint')}</p>
      <div class="modal-form-inline">
        <input
          class="form-input"
          type="text"
          placeholder="08:00"
          value={draft.availableFrom ?? ''}
          disabled={busy}
          oninput={(event) => {
            draft = {
              ...draft,
              availableFrom: (event.currentTarget as HTMLInputElement).value || null,
            };
            timeWindowError = '';
          }}
        />
        <span aria-hidden="true">–</span>
        <input
          class="form-input"
          type="text"
          placeholder="09:00"
          value={draft.availableTo ?? ''}
          disabled={busy}
          oninput={(event) => {
            draft = {
              ...draft,
              availableTo: (event.currentTarget as HTMLInputElement).value || null,
            };
            timeWindowError = '';
          }}
        />
      </div>
      {#if timeWindowError}
        <span class="modal-form-error">{timeWindowError}</span>
      {/if}
    </fieldset>

    <div class="form-actions">
      <div class="form-actions__end">
        {#if mode === 'edit' && canDelete}
          <Button type="button" variant="ghost" disabled={busy} onclick={() => onDelete?.()}>
            {t('mfa.settings.topicRemove')}
          </Button>
        {/if}
        <Button type="button" variant="outline" disabled={busy} onclick={handleClose}>{t('ui.cancel')}</Button>
        <Button type="submit" variant="primary" disabled={busy}>{t('mfa.settings.topicModalApply')}</Button>
      </div>
    </div>
  </form>
</Modal>

<TopicIconPickerModal bind:open={iconPickerOpen} selectedIconId={draft.iconId} onSelect={handleIconSelect} />
