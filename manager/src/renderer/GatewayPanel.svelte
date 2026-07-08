<script lang="ts">
  import type { HostStatus, NetworkSnapshot } from '../shared/host-status.js';
  import type { GatewayFieldState } from './host-network-panels.js';

  let {
    state,
    network,
    lanIpFallback,
    disabled = false,
    onChange,
  }: {
    state: GatewayFieldState;
    network: NetworkSnapshot | null;
    lanIpFallback: string;
    disabled?: boolean;
    onChange: (patch: Partial<GatewayFieldState>) => void;
  } = $props();

  const composeSupported = $derived(network?.gatewayComposeSupported ?? true);
  const interfaceNames = $derived(new Set((network?.interfaces ?? []).map((iface) => iface.name)));
  const showCustomInterface = $derived(
    Boolean(
      state.gatewayInterface &&
        !interfaceNames.has(state.gatewayInterface) &&
        state.gatewayInterface !== 'eth1',
    ),
  );
</script>

<label class="wizard-radio">
  <input
    type="checkbox"
    checked={state.gatewayEnabled}
    {disabled}
    onchange={(event) => {
      const enabled = event.currentTarget.checked;
      onChange({
        gatewayEnabled: enabled,
        portalAppIp:
          enabled && !state.portalAppIp.trim() ? lanIpFallback : state.portalAppIp,
        authBridgeUrl:
          enabled && !state.authBridgeUrl.trim()
            ? (network?.defaultGatewayBridgeUrl ?? '')
            : state.authBridgeUrl,
      });
    }}
  />
  <span>Gast-WLAN vorbereiten (Captive-Portal-Einstellungen in der Host-Konfiguration speichern)</span>
</label>

{#if state.gatewayEnabled && !composeSupported}
  <p class="wizard-hint">
    Hinweis: Auf diesem Rechner (macOS/Windows) startet kein Gateway-Dienst. Die Werte werden nur in
    die Konfiguration geschrieben — für ein separates Linux-Gateway oder den späteren Feldtest.
  </p>
{/if}

{#if state.gatewayEnabled}
  <p class="wizard-hint">
    Netzwerk-Schnittstelle am Gateway-Rechner für das Gast-Netz (z. B. eth1). Darüber laufen DHCP und
    Captive Portal. Ihre IT leitet den Gast-WLAN-Traffic dorthin.
  </p>

  <fieldset class="wizard-fieldset">
    {#each network?.interfaces ?? [] as iface (iface.name)}
      <label class="wizard-radio">
        <input
          type="radio"
          name="network-gateway-interface"
          value={iface.name}
          checked={state.gatewayInterface === iface.name}
          {disabled}
          onchange={() => onChange({ gatewayInterface: iface.name })}
        />
        <span>
          {iface.name} — {iface.addresses.map((a) => a.address).join(', ') || 'keine IPv4'}
        </span>
      </label>
    {/each}

    {#if !interfaceNames.has('eth1')}
      <label class="wizard-radio">
        <input
          type="radio"
          name="network-gateway-interface"
          value="eth1"
          checked={state.gatewayInterface === 'eth1'}
          {disabled}
          onchange={() => onChange({ gatewayInterface: 'eth1' })}
        />
        <span>eth1 (Standard, manuell)</span>
      </label>
    {/if}

    {#if showCustomInterface}
      <label class="wizard-radio">
        <input
          type="radio"
          name="network-gateway-interface"
          value={state.gatewayInterface}
          checked
          {disabled}
          onchange={() => onChange({ gatewayInterface: state.gatewayInterface })}
        />
        <span>{state.gatewayInterface} (aus .env)</span>
      </label>
    {/if}
  </fieldset>

  <label class="wizard-field-label" for="network-gateway-ip">IP des Gateways im Gast-Netz</label>
  <input
    id="network-gateway-ip"
    type="text"
    class="wizard-input"
    placeholder="192.168.88.1"
    value={state.gatewayIp}
    {disabled}
    oninput={(event) => onChange({ gatewayIp: event.currentTarget.value })}
  />

  <label class="wizard-field-label" for="network-portal-ip">IP der Praxis-App für Patienten im Gast-WLAN</label>
  <input
    id="network-portal-ip"
    type="text"
    class="wizard-input"
    placeholder={lanIpFallback || '192.168.1.50'}
    value={state.portalAppIp}
    {disabled}
    oninput={(event) => onChange({ portalAppIp: event.currentTarget.value })}
  />

  <label class="wizard-field-label" for="network-auth-bridge-url">Adresse der Gateway-Bridge für die app</label>
  <input
    id="network-auth-bridge-url"
    type="text"
    class="wizard-input"
    placeholder={network?.defaultGatewayBridgeUrl ?? 'http://<gateway-host>:9100'}
    value={state.authBridgeUrl}
    {disabled}
    oninput={(event) => onChange({ authBridgeUrl: event.currentTarget.value })}
  />

  <p class="wizard-hint">
    Die app ruft diese Adresse auf, um nach gültiger Wartenummer die Internetfreigabe am Gateway
    auszulösen. Bei separatem Linux-Gateway muss hier dessen aus der app erreichbare Bridge-Adresse
    stehen.
  </p>

  <p class="wizard-hint">
    Was der Wizard hier macht: Er trägt die technischen Werte in die Host-Konfiguration ein. Was
    noch fehlt: Access Point / Gast-WLAN in der Praxis, Routing zum Gateway und — falls nötig — das
    Linux-Gateway-Gerät. Details: Dokumentation „Guest-WLAN & Captive Portal“.
  </p>
{/if}
