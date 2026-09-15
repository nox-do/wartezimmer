<script lang="ts">
  import { mountNetworkTopologyDiagram, type NetworkTopologyLabels } from './network-topology-diagram.js';

  let {
    labels,
  }: {
    labels: NetworkTopologyLabels;
  } = $props();

  let host = $state<HTMLElement | null>(null);

  $effect(() => {
    if (!host) {
      return;
    }
    mountNetworkTopologyDiagram(host, labels);
  });
</script>

<div bind:this={host} id="network-diagram"></div>
