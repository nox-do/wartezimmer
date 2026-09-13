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
  Ohne Proxy ist der Demo-/Erststart über <code>:8080</code> auf allen Netzwerkkarten erreichbar. Mit
  Proxy läuft die App nur lokal; Port 80 und später HTTPS werden ausschließlich an die gewählte
  Staff-Adresse gebunden.
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
  <p class="hint">
    Zielport für Geräte: <code>80</code> (statt <code>8080</code>). Die Staff-Adresse muss beim Start
    am Rechner vorhanden sein.
  </p>
{/if}
