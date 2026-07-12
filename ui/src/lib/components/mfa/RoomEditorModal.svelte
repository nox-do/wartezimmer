<script lang="ts">
  import Modal from '$lib/components/Modal.svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import type { PracticeRoomWithPanels } from '$lib/queue/ops-settings-api';
  import { emptyRoomPanels, generateRoomId, isValidRoomId } from '$lib/queue/ops-settings-api';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { toastStore } from '$lib/stores/toastStore';

  interface Props {
    open?: boolean;
    roomIdsTaken?: Set<string>;
    busy?: boolean;
    onApply?: (room: PracticeRoomWithPanels) => void;
    onCancel?: () => void;
  }

  let {
    open = $bindable(false),
    roomIdsTaken = new Set<string>(),
    busy = false,
    onApply,
    onCancel,
  }: Props = $props();

  let labelError = $state('');

  $effect(() => {
    if (!open) {
      return;
    }
    labelError = '';
  });

  function buildDraft(): PracticeRoomWithPanels {
    const roomLabel = t('mfa.settings.roomDefaultLabel');
    return {
      roomId: generateRoomId(roomIdsTaken),
      roomLabel,
      enabled: true,
      defaultCallTarget: false,
      maxOccupancy: null,
      panels: emptyRoomPanels().panels,
    };
  }

  let draft = $state<PracticeRoomWithPanels>(buildDraft());

  $effect(() => {
    if (!open) {
      return;
    }
    draft = buildDraft();
  });

  function validate(): boolean {
    labelError = '';
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
    return true;
  }

  function handleApply() {
    if (!validate()) {
      return;
    }
    onApply?.({
      ...draft,
      roomId: draft.roomId.trim(),
      roomLabel: draft.roomLabel.trim(),
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
  title={t('mfa.settings.roomModalAddTitle')}
  headerClass="modal-header--hero bg-gradient-primary"
  maxWidth="480px"
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
        oninput={(event) => {
          draft = { ...draft, roomLabel: (event.currentTarget as HTMLInputElement).value };
          labelError = '';
        }}
      />
      {#if labelError}
        <span class="modal-form-error">{labelError}</span>
      {/if}
    </label>

    <div class="form-actions">
      <div class="form-actions__end">
        <Button type="button" variant="outline" disabled={busy} onclick={handleClose}>{t('ui.cancel')}</Button>
        <Button type="submit" variant="primary" disabled={busy}>{t('mfa.settings.topicModalApply')}</Button>
      </div>
    </div>
  </form>
</Modal>
