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
  <div class="network-columns">
    <label class="wizard-radio network-column network-radio">
      <input type="radio" name={groupName} checked={enabled} onchange={() => onChange(true)} />
      <span><strong>Proxy an · Port 80</strong><span class="network-option-hint">Zugriff ohne Portangabe. Voraussetzung für HTTPS.</span></span>
    </label>
    <label class="wizard-radio network-column network-radio">
      <input type="radio" name={groupName} checked={!enabled} onchange={() => onChange(false)} />
      <span><strong>Proxy aus · Port 8080</strong><span class="network-option-hint">Direkter Zugriff mit <code>:8080</code> in der Adresse.</span></span>
    </label>
  </div>
</fieldset>
