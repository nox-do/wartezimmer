<script lang="ts">
  import { mountNetworkTopologyDiagram } from './network-topology-diagram.js';

  let {
    lanIp,
    gatewayIp,
    gatewayEnabled,
  }: {
    lanIp?: string | null;
    gatewayIp?: string | null;
    gatewayEnabled?: boolean;
  } = $props();

  let host = $state<HTMLElement | null>(null);

  $effect(() => {
    if (!host) {
      return;
    }
    mountNetworkTopologyDiagram(host, { lanIp, gatewayIp, gatewayEnabled });
  });
</script>

<div bind:this={host} id="network-diagram"></div>
