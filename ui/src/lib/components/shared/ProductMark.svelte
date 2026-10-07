<script lang="ts">
  let { size = 32 }: { size?: number } = $props();
</script>

<img src="/brand/wartezimmer.svg" alt="" width={size} height={size} />

<style>
  img {
    display: block;
    flex-shrink: 0;
  }
</style>
