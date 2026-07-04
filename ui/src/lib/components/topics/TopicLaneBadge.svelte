<script lang="ts">
  import { laneBadgeStyle, normalizeTopicAccentColor } from '$lib/topics/topic-accent';

  interface Props {
    laneCode: string;
    accentColor: string;
    title?: string;
    class?: string;
  }

  let { laneCode, accentColor, title, class: className = '' }: Props = $props();

  const letter = $derived(laneCode.trim().toUpperCase().slice(0, 1) || '?');
  const style = $derived(laneBadgeStyle(normalizeTopicAccentColor(accentColor)));
</script>

<span
  class="topic-lane-badge {className}"
  style={style}
  title={title ?? letter}
  aria-hidden="true"
>
  {letter}
</span>

<style>
  .topic-lane-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 5px;
    font-size: 0.7rem;
    font-weight: 800;
    line-height: 1;
    text-transform: uppercase;
    flex-shrink: 0;
  }
</style>
