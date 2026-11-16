<script lang="ts">
  import Modal from '../Modal.svelte';
  let { onClose = () => {}, onNestedClose = () => {} }: { onClose?: () => void; onNestedClose?: () => void } = $props();
  let open = $state(false);
  let busy = $state(false);
  let nested = $state(false);
  export function setOpen(value: boolean) { open = value; }
  export function setBusy(value: boolean) { busy = value; }
  export function setNested(value: boolean) { nested = value; }
</script>
<button onclick={() => open = true}>Open</button>
<output>{String(open)}</output>
<Modal bind:open closeDisabled={busy} closeOnBackdropClick onClose={onClose}>
  {#snippet header(titleId)}<h2 id={titleId}>Parent</h2>{/snippet}
  <button onclick={() => nested = true}>Nested</button>
  <Modal bind:open={nested} title="Child" onClose={onNestedClose}>
    <button>Child control</button>
  </Modal>
</Modal>
