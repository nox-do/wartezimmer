<script lang="ts">
  import Modal from '$lib/components/Modal.svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { TOPIC_ICON_CATALOG, type TopicIconId } from '$lib/topics/topic-icon-catalog';

  interface Props {
    open?: boolean;
    selectedIconId?: string | null;
    onSelect?: (iconId: TopicIconId | null) => void;
  }

  let { open = $bindable(false), selectedIconId = null, onSelect }: Props = $props();

  let query = $state('');

  const filteredIcons = $derived(
    TOPIC_ICON_CATALOG.filter((entry) => {
      const q = query.trim().toLowerCase();
      if (!q) {
        return true;
      }
      return entry.id.includes(q) || entry.label.toLowerCase().includes(q);
    }),
  );

  function pick(iconId: TopicIconId | null) {
    onSelect?.(iconId);
    open = false;
  }
</script>

<Modal
  bind:open
  title={t('mfa.settings.topicIconPickerTitle')}
  headerClass="modal-header--hero bg-gradient-primary"
  maxWidth="720px"
  dimBackdrop={true}
  contentClass="topic-icon-modal"
>
  <p class="modal-subtitle">{t('mfa.settings.topicIconPickerLead')}</p>

  <label class="topic-icon-search">
    <span class="sr-only">{t('mfa.settings.topicIconSearchLabel')}</span>
    <input
      class="form-input"
      type="search"
      placeholder={t('mfa.settings.topicIconSearchPlaceholder')}
      bind:value={query}
    />
  </label>

  <div class="topic-icon-grid" role="listbox" aria-label={t('mfa.settings.topicIconPickerTitle')}>
    <button
      type="button"
      class="topic-icon-option"
      class:topic-icon-option--selected={selectedIconId == null}
      onclick={() => pick(null)}
    >
      <span class="topic-icon-option-preview topic-icon-option-preview--letter" aria-hidden="true">A</span>
      <span class="topic-icon-option-label">{t('mfa.settings.topicIconNone')}</span>
    </button>

    {#each filteredIcons as entry (entry.id)}
      {@const Icon = entry.component}
      <button
        type="button"
        class="topic-icon-option"
        class:topic-icon-option--selected={selectedIconId === entry.id}
        onclick={() => pick(entry.id)}
      >
        <span class="topic-icon-option-preview" aria-hidden="true">
          <Icon size={22} />
        </span>
        <span class="topic-icon-option-label">{entry.label}</span>
      </button>
    {/each}
  </div>
</Modal>

