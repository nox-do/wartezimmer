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
  const groupName = $props.id();
</script>

<fieldset class="wizard-fieldset" {disabled}>
  <legend class="lan-ip-prompt">Wie möchten Sie Praxis Flow erreichen?</legend>

  <label class="wizard-radio">
    <input type="radio" name={groupName} checked={enabled} onchange={() => onChange(true)} />
    <span>Proxy an</span>
  </label>
  <p class="hint">
    Zugriff ohne Portangabe in der Adresse (HTTP-Port 80 statt 8080), ausschließlich über die
    ausgewählte Praxisadresse. HTTPS kann anschließend eingerichtet werden.
  </p>

  <label class="wizard-radio">
    <input type="radio" name={groupName} checked={!enabled} onchange={() => onChange(false)} />
    <span>Proxy aus</span>
  </label>
  <p class="hint">
    Direkter Zugriff mit <code>:8080</code> in der Adresse. Praxis Flow ist auf allen Netzwerkkarten
    erreichbar. Für HTTPS muss der Proxy eingeschaltet werden.
  </p>
</fieldset>
