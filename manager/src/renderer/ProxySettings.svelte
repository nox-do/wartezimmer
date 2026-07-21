<script lang="ts">
  let {
    enabled,
    disabled = false,
    onChange,
  }: {
    enabled: boolean;
    disabled?: boolean;
    onChange: (enabled: boolean) => void;
  } = $props();
</script>

<p class="hint">
  Optional: Geräte erreichen Praxis Flow ohne <code>:8080</code> in der Adresse. Intern wird dafür ein
  zusätzlicher Proxy-Dienst gestartet.
</p>
<label class="wizard-checkbox">
  <input
    type="checkbox"
    checked={enabled}
    {disabled}
    onchange={(event) => onChange((event.currentTarget as HTMLInputElement).checked)}
  />
  <span>Einfacher Gerätezugriff über Port 80</span>
</label>
{#if enabled}
  <p class="hint">Zielport für Geräte: <code>80</code> (statt <code>8080</code>).</p>
{/if}
