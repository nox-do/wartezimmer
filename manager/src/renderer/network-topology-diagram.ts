export type NetworkTopologyLabels = {
  lanIp?: string | null;
  gatewayIp?: string | null;
  gatewayEnabled?: boolean;
};

/**
 * Two deployment scenarios: full patient portal (Gast-WLAN + gateway) vs. practice-internal only.
 */
export function mountNetworkTopologyDiagram(
  host: HTMLElement,
  labels: NetworkTopologyLabels = {},
): void {
  const lanIp = labels.lanIp?.trim() || '192.168.1.x';
  const gatewayIp = labels.gatewayIp?.trim() || '192.168.88.1';
  const gatewayOn = labels.gatewayEnabled !== false;

  host.replaceChildren();

  const intro = document.createElement('p');
  intro.className = 'network-diagram-intro';
  intro.textContent =
    'Zwei Betriebsarten im Überblick. Wenn das Patientenportal über ein Gast-WLAN angeboten werden soll, empfehlen wir Szenario 1 mit getrenntem Gateway-Gerät im Gast-LAN.';
  host.append(intro);

  host.append(
    buildPortalScenario({ lanIp, gatewayIp, isCurrent: gatewayOn }),
    buildInternalScenario({ lanIp, isCurrent: !gatewayOn }),
  );
}

function buildPortalScenario(input: {
  lanIp: string;
  gatewayIp: string;
  isCurrent: boolean;
}): HTMLElement {
  const section = document.createElement('section');
  section.className = `net-scenario net-scenario--portal${input.isCurrent ? ' is-current' : ''}`;

  section.innerHTML = `
    <header class="net-scenario-header">
      <h3 class="net-scenario-title">Szenario 1: Gast-WLAN mit Captive Portal</h3>
      <p class="net-scenario-badges">
        <span class="net-scenario-badge net-scenario-badge--recommended">empfohlen bei Portal</span>
        ${input.isCurrent ? '<span class="net-scenario-badge net-scenario-badge--active">Ihre Konfiguration</span>' : ''}
      </p>
    </header>
    <p class="net-scenario-lead">
      Der Praxis-Flow-Stack läuft typischerweise auf dem Praxis-PC (oft Windows). Das Gast-WLAN hängt
      an einem kleinen Linux-Mini-PC als Gateway; die Portal-Oberfläche läuft weiter in der <strong>app</strong>.
    </p>
  `;

  const flow = document.createElement('div');
  flow.className = 'net-flow';
  flow.setAttribute('aria-label', 'Datenpfad Patienten');
  flow.innerHTML = `
    ${flowStep('Patienten-Handy', { variant: 'neutral', detail: 'verbindet per WLAN' })}
    ${flowArrow('Gast-WLAN')}
    ${flowStep('Router / WLAN-AP', {
      variant: 'extern',
      detail: 'Praxis-IT',
    })}
    ${flowArrow('Gast-LAN / VLAN')}
    ${flowStep('Gateway-Mini-PC', {
      variant: 'ours',
      detail: 'Linux · openNDS · DHCP · Auth-Bridge',
      note: `Gateway-IP ${escapeHtml(input.gatewayIp)} · dediziertes Gast-Netz`,
    })}
    ${flowArrow('Portal aufrufen')}
    ${flowGatewayDecision(input.lanIp)}
    <p class="net-flow-footnote">
      Staff-Geräte (Terminal, TV, MFA) nutzen das <strong>Praxis-LAN</strong> → LAN-IP
      <strong>${escapeHtml(input.lanIp)}</strong> — direkt zur app, ohne Captive Portal.
    </p>
  `;
  section.append(flow);

  section.append(buildChecklist([
    'Router/AP: nur Gast-WLAN/VLAN; kein Access Point im Lieferumfang.',
    'GATEWAY_INTERFACE/GATEWAY_IP: Gastseite des Mini-PCs; DHCP setzt diese IP als Default-Route und DNS.',
    'APP_PORTAL_URL/PORTAL_FQDN: Portal-Ziel der app für den Captive-Portal-Redirect.',
    'Patienten geben immer zuerst ihre Wartenummer im Portal ein.',
    'Danach: Portal weiter nutzen oder Internet über das Gateway freigeben.',
    'GATEWAY_AUTH_BRIDGE_URL: von der app erreichbare Adresse der Auth-Bridge auf dem Gateway.',
  ]));

  return section;
}

function buildInternalScenario(input: { lanIp: string; isCurrent: boolean }): HTMLElement {
  const section = document.createElement('section');
  section.className = `net-scenario net-scenario--internal${input.isCurrent ? ' is-current' : ''}`;

  section.innerHTML = `
    <header class="net-scenario-header">
      <h3 class="net-scenario-title">Szenario 2: Nur Praxis-intern</h3>
      ${
        input.isCurrent
          ? '<p class="net-scenario-badges"><span class="net-scenario-badge net-scenario-badge--active">Ihre Konfiguration</span></p>'
          : ''
      }
    </header>
    <p class="net-scenario-lead">
      Ein Netzanschluss reicht. Terminal, TV und MFA erreichen die app direkt — kein Gast-WLAN, kein
      gateway-Container.
    </p>
  `;

  const flow = document.createElement('div');
  flow.className = 'net-flow';
  flow.setAttribute('aria-label', 'Datenpfad Praxis-intern');
  flow.innerHTML = `
    ${flowStep('Terminal · TV · MFA · Ops', { variant: 'neutral' })}
    ${flowArrow('Praxis-LAN')}
    ${flowStep('Praxis-Flow-Host', {
      variant: 'ours',
      detail: 'app · sandbox',
      note: `LAN-IP ${escapeHtml(input.lanIp)} :8080`,
    })}
    ${flowArrow()}
    ${flowStep('Portal im Browser', {
      variant: 'neutral',
      note: 'ohne Gast-WLAN — z. B. Entwicklung',
    })}
  `;
  section.append(flow);

  section.append(
    buildChecklist([
      'Geräte-URLs und Erreichbarkeit stehen auf dem Status-Screen.',
      'Für Gast-WLAN mit Captive Portal: Szenario 1 — Gateway unten aktivieren.',
    ]),
  );

  return section;
}

function flowStep(
  label: string,
  options: {
    variant?: 'neutral' | 'extern' | 'ours';
    detail?: string;
    note?: string;
  } = {},
): string {
  const variant = options.variant ?? 'neutral';
  const detail = options.detail
    ? `<span class="net-flow-step-detail">${escapeHtml(options.detail)}</span>`
    : '';
  const note = options.note
    ? `<span class="net-flow-step-note">${escapeHtml(options.note)}</span>`
    : '';
  return `<div class="net-flow-step net-flow-step--${variant}"><span class="net-flow-step-label">${escapeHtml(label)}</span>${detail}${note}</div>`;
}

function flowArrow(caption?: string): string {
  const cap = caption
    ? `<span class="net-flow-arrow-caption">${escapeHtml(caption)}</span>`
    : '';
  return `<div class="net-flow-arrow" aria-hidden="true"><span class="net-flow-arrow-icon">↓</span>${cap}</div>`;
}

function flowHostBlock(lanIp: string): string {
  return `
    <div class="net-flow-host">
      <p class="net-flow-host-title">Praxis-Flow-Stack</p>
      <p class="net-flow-host-stack">Praxis-PC mit Docker · app · sandbox</p>
      <div class="net-flow-host-nics">
        <div class="net-flow-host-nic net-flow-host-nic--lan">
          <span class="net-flow-host-nic-label">App-Adresse</span>
          <span class="net-flow-host-nic-text"><strong>${escapeHtml(lanIp)}</strong>:8080 im Praxis-LAN</span>
        </div>
        <div class="net-flow-host-nic net-flow-host-nic--portal">
          <span class="net-flow-host-nic-label">Portal (app)</span>
          <span class="net-flow-host-nic-text">/portal ist das Captive-Portal-Ziel</span>
        </div>
      </div>
      <p class="net-flow-host-caption">Das Gateway leitet Patienten zur Portal-URL der app.</p>
    </div>
  `;
}

function flowGatewayDecision(lanIp: string): string {
  return `
    <div class="net-flow-decision">
      <p class="net-flow-decision-title">Nach Wartenummer im Portal</p>
      <div class="net-flow-decision-branches">
        <section class="net-flow-decision-branch net-flow-decision-branch--portal">
          <span class="net-flow-branch-when">Portal nutzen</span>
          ${flowHostBlock(lanIp)}
        </section>
        <section class="net-flow-decision-branch net-flow-decision-branch--internet">
          <span class="net-flow-branch-when">Internet freigeben</span>
          <div class="net-flow-internet">
            <span class="net-flow-branch-target">Internet</span>
            <span class="net-flow-branch-note">Freigabe im Gateway nach Portal-Auswahl</span>
          </div>
        </section>
      </div>
    </div>
  `;
}

function buildChecklist(items: string[]): HTMLElement {
  const list = document.createElement('ul');
  list.className = 'net-scenario-checklist wizard-hint';
  for (const text of items) {
    const li = document.createElement('li');
    li.textContent = text;
    list.append(li);
  }
  return list;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
