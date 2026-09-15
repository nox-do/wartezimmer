<script lang="ts">
  let {
    address,
    savedAddress = null,
    legacy = false,
    disabled = false,
    checking = false,
    canVerify = false,
    verifyHint = null,
    onVerify,
  }: {
    address: string | null;
    savedAddress?: string | null;
    legacy?: boolean;
    disabled?: boolean;
    checking?: boolean;
    canVerify?: boolean;
    verifyHint?: string | null;
    onVerify?: () => void;
  } = $props();
  let copied = $state(false);
  let copyError = $state(false);
  const changed = $derived(Boolean(address && savedAddress && address !== savedAddress));
  const current = $derived(savedAddress);
  $effect(() => { void address; void savedAddress; copied = false; copyError = false; });

  async function copyAddress(): Promise<void> {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(current);
      copied = true;
      copyError = false;
    } catch {
      copyError = true;
    }
  }
</script>

<div class="reachability-panel">
  {#if current}
    <p class="hint">Geräteadresse: <code>{current}</code></p>
    <div class="actions-row">
      <button type="button" class="btn-secondary" {disabled}
        onclick={() => void window.praxisManager.openExternalUrl(current)}>Öffnen</button>
      <button type="button" class="btn-secondary" {disabled}
        onclick={() => void copyAddress()}>{copied ? 'Kopiert' : 'Kopieren'}</button>
      {#if onVerify}
        <button type="button" class="btn-secondary" disabled={disabled || checking || !canVerify}
          onclick={onVerify}>{checking ? 'Prüfe …' : 'Adresse prüfen'}</button>
      {/if}
    </div>
    {#if copyError}<p class="error" role="status">Kopieren nicht möglich. Bitte die Adresse manuell kopieren.</p>{/if}
    {#if onVerify && !canVerify && verifyHint}<p class="hint">{verifyHint}</p>{/if}
  {/if}
  {#if address && (!current || changed)}
    <p class="hint">Geräteadresse nach dem Anwenden: <code>{address}</code></p>
  {/if}
  {#if legacy}
    <p class="hint">Die bisherige HTTP-Adresse bleibt erhalten. Eine neue Domain richten Sie unter HTTPS ein.</p>
  {/if}
</div>
