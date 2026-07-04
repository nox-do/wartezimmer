<script lang="ts">
  interface Props {
    label: string;
    description?: string;
    checked: boolean;
    busy?: boolean;
    disabled?: boolean;
    onChange?: (next: boolean) => void;
  }

  let { label, description, checked, busy = false, disabled = false, onChange }: Props = $props();

  function handleChange(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    onChange?.(target.checked);
  }
</script>

<label class="mfa-bool-setting" class:mfa-bool-setting--busy={busy}>
  <input type="checkbox" {checked} disabled={busy || disabled} onchange={handleChange} />
  <span class="mfa-bool-setting-text">
    <strong>{label}</strong>
    {#if description?.trim()}
      <span>{description}</span>
    {/if}
  </span>
</label>
