<script lang="ts">
  interface Props {
    title: string;
    lead?: string;
  }

  let { title, lead = '' }: Props = $props();
</script>

<header class="mfa-settings-page-header">
  <h1>{title}</h1>
  {#if lead}
    <p>{lead}</p>
  {/if}
</header>
