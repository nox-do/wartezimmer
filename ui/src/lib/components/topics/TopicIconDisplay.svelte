<script lang="ts">
  import { resolveTopicIconComponent, topicInitialLetter } from '$lib/topics/topic-icon-catalog';

  import { laneBadgeStyle, normalizeTopicAccentColor } from '$lib/topics/topic-accent';

  interface Props {
    iconId?: string | null;
    label: string;
    size?: number;
    accentColor?: string | null;
    class?: string;
  }

  let { iconId = null, label, size = 22, accentColor = null, class: className = '' }: Props = $props();

  const Icon = $derived(resolveTopicIconComponent(iconId));
  const initial = $derived(topicInitialLetter(label));
  const accentStyle = $derived(accentColor ? laneBadgeStyle(normalizeTopicAccentColor(accentColor)) : null);
</script>

<span
  class="topic-icon-display {className}"
  class:topic-icon-display--accent={accentStyle != null}
  style={accentStyle ?? undefined}
  aria-hidden="true"
>
  {#if Icon}
    <Icon {size} />
  {:else}
    <span class="topic-icon-display__letter">{initial}</span>
  {/if}
</span>

<style>
  .topic-icon-display {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: inherit;
  }

  .topic-icon-display--accent {
    width: 2rem;
    height: 2rem;
    border-radius: 8px;
  }

  .topic-icon-display__letter {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 999px;
    background: var(--card-glass-12);
    font-size: 1rem;
    font-weight: 800;
    line-height: 1;
    text-transform: uppercase;
  }

  .topic-icon-display--accent .topic-icon-display__letter {
    width: 100%;
    height: 100%;
    border-radius: inherit;
    background: transparent;
  }
</style>
