<script lang="ts">
  let { loading = false }: { loading?: boolean } = $props();
</script>

{#if loading}
  <div class="view-loading-overlay" role="status" aria-live="polite">Wird geladen …</div>
{/if}
