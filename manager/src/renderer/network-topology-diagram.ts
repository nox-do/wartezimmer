export type NetworkTopologyLabels = {
  lanIp?: string | null;
};

/**
 * Two operating pictures — product boundary vs. recommendation:
 * - Recommended for patient portal: Praxis-IT captive → our /portal → thin adapter release
 * - Practice-internal only: staff devices → app (portal without captive is limited / lab)
 */
export function mountNetworkTopologyDiagram(
  host: HTMLElement,
  labels: NetworkTopologyLabels = {},
): void {
  const lanIp = labels.lanIp?.trim() || '192.168.1.x';

  host.replaceChildren();

  const intro = document.createElement('div');
  intro.className = 'network-diagram-intro';
  intro.innerHTML = `
    <p>Zwei Betriebsarten — Praxis Flow liefert <strong>kein</strong> Captive Portal und keinen Router.</p>
    <ul class="network-diagram-intro-list">
      <li><strong>Mit Patientenportal:</strong> WLAN/Captive stellt die Praxis-IT; wir prüfen die Wartenummer und geben über Adapter frei.</li>
      <li><strong>Nur Praxis-intern:</strong> Terminal, TV und MFA — Portal ohne Captive höchstens zum Test.</li>
    </ul>
  `;
  host.append(intro, buildPortalScenario(lanIp), buildInternalScenario(lanIp));
}

function buildPortalScenario(lanIp: string): HTMLElement {
  const section = document.createElement('section');
  section.className = 'net-scenario net-scenario--portal';

  section.innerHTML = `
    <header class="net-scenario-header">
      <h3 class="net-scenario-title">Patientenportal im Gast-WLAN</h3>
      <p class="net-scenario-badges">
        <span class="net-scenario-badge net-scenario-badge--recommended">empfohlen bei Portal</span>
      </p>
    </header>
    <p class="net-scenario-lead">
      Captive und Access Point bleiben bei der Praxis-IT (Omada, UniFi, …). Praxis Flow stellt das
      Portal (<code>/portal</code>) und prüft die Wartenummer; Freigabe später über einen dünnen Vendor-Adapter.
    </p>
    <p class="net-scenario-security hint">
      <strong>Empfehlung:</strong> Dediziertes Gast-Netz und Firewall so, dass Gäste nur das Portal
      erreichen. Praxis Flow ersetzt keine Netzwerksicherheit.
    </p>
  `;

  const flow = document.createElement('div');
  flow.className = 'net-flow';
  flow.setAttribute('aria-label', 'Datenpfad Patientenportal');
  flow.innerHTML = `
    ${flowStep('Patienten-Handy', { variant: 'neutral', detail: 'Gast-WLAN' })}
    ${flowArrow('Captive')}
    ${flowStep('Router / AP / Controller', {
      variant: 'extern',
      detail: 'Praxis-IT — nicht unser Produkt',
    })}
    ${flowArrow('Redirect')}
    ${flowStep('Portal (/portal)', {
      variant: 'ours',
      detail: 'Wartenummer · Session',
      note: `app auf ${escapeHtml(lanIp)}`,
    })}
    ${flowArrow('nach OK')}
    <div class="net-flow-row">
      ${flowStep('Upload · Formulare', { variant: 'ours' })}
      ${flowStep('Internet freigeben', {
        variant: 'extern',
        detail: 'Adapter → Controller',
      })}
    </div>
    <p class="net-flow-footnote">
      Staff (Terminal, TV, MFA) nutzt das Praxis-LAN direkt zur app — ohne Captive.
    </p>
  `;
  section.append(flow);

  section.append(
    buildChecklist([
      'Captive External Portal / Splash zeigt auf die Portal-URL der app.',
      'Ohne Captive ist das Patientenportal im Gast-WLAN nicht der vorgesehene Betrieb.',
      'Vendor-Adapter (Freigabe nach Wartenummer) sind geplant — noch nicht konfigurierbar.',
    ]),
  );

  return section;
}

function buildInternalScenario(lanIp: string): HTMLElement {
  const section = document.createElement('section');
  section.className = 'net-scenario net-scenario--internal';

  section.innerHTML = `
    <header class="net-scenario-header">
      <h3 class="net-scenario-title">Nur Praxis-intern</h3>
    </header>
    <p class="net-scenario-lead">
      Ein Netzanschluss reicht. Terminal, TV und MFA erreichen die app direkt — kein Gast-WLAN nötig.
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
      note: `LAN-IP ${escapeHtml(lanIp)} :8080`,
    })}
    <p class="net-flow-footnote">
      <code>/portal</code> im Browser nur für Entwicklung/Test — nicht als Patienten-Gast-Zugang ohne Captive.
    </p>
  `;
  section.append(flow);

  section.append(
    buildChecklist([
      'Geräte-URLs stehen auf dem Status-Screen.',
      'Für produktives Patientenportal: Betriebsart oben (Praxis-IT-Captive).',
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
  const cap = caption ? `<span class="net-flow-arrow-caption">${escapeHtml(caption)}</span>` : '';
  return `<div class="net-flow-arrow" aria-hidden="true"><span class="net-flow-arrow-icon">↓</span>${cap}</div>`;
}

function buildChecklist(items: string[]): HTMLElement {
  const list = document.createElement('ul');
  list.className = 'net-scenario-checklist hint';
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
