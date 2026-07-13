<script lang="ts">
  import '$lib/styles/room-panel.css';

  let { children } = $props();
</script>

<div class="room-panel-page">
  {@render children()}
</div>
