<script lang="ts">
  import IconButton from './IconButton.svelte';

  let {
    label,
    value = '',
    disabled = false,
    onChange,
    onBrowse,
  }: {
    label: string;
    value?: string;
    disabled?: boolean;
    onChange: (value: string) => void;
    onBrowse: () => void | Promise<string | null>;
  } = $props();
</script>

<div class="folder-path-row">
  <span class="folder-path-label">{label}</span>
  <div class="folder-path-controls">
    <input
      type="text"
      class="wizard-input folder-path-input"
      {value}
      {disabled}
      spellcheck={false}
      oninput={(event) => onChange(event.currentTarget.value)}
    />
    <IconButton
      icon="folder-open"
      class="btn-secondary"
      ariaLabel="{label}: Ordner wählen"
      title="Ordner wählen"
      {disabled}
      onclick={() => {
        void onBrowse();
      }}
    />
  </div>
</div>
