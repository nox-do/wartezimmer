<script lang="ts">
  let { message }: { message: string | null } = $props();
  let dialog = $state<HTMLDialogElement | null>(null);
  let acknowledged = $state<string | null>(null);
  let displayedMessage = $state('');

  $effect(() => {
    if (!message) acknowledged = null;
    if (message && message !== acknowledged && dialog && !dialog.open) {
      displayedMessage = message;
      dialog.showModal();
    }
  });

  function acknowledge(): void {
    acknowledged = displayedMessage;
    dialog?.close();
  }
</script>

<dialog bind:this={dialog} class="maintenance-dialog" oncancel={(event) => event.preventDefault()}>
  <h2>Vorgang fehlgeschlagen</h2>
  <p class="error">{displayedMessage}</p>
  <div class="actions-row actions-row--dialog">
    <button type="button" onclick={acknowledge}>OK</button>
  </div>
</dialog>
