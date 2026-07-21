<script lang="ts">
  import { mountNetworkTopologyDiagram } from './network-topology-diagram.js';

  let {
    lanIp,
  }: {
    lanIp?: string | null;
  } = $props();

  let host = $state<HTMLElement | null>(null);

  $effect(() => {
    if (!host) {
      return;
    }
    mountNetworkTopologyDiagram(host, { lanIp });
  });
</script>

<div bind:this={host} id="network-diagram"></div>
