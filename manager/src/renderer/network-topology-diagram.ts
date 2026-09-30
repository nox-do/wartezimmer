export type NetworkTopologyLabels = {
  lanIp?: string | null;
  proxyEnabled?: boolean;
  httpsEnabled?: boolean;
  baseUrl?: string | null;
  operation?: string;
  diagnosis?: string;
  portalState?: string | null;
};

/** Saved configuration only; observed health is labelled separately. No network-isolation claim. */
export function mountNetworkTopologyDiagram(
  host: HTMLElement,
  labels: NetworkTopologyLabels = {},
): void {
  host.replaceChildren();
  const ip = labels.lanIp?.trim() || 'noch nicht gewählt';
  const proxy = Boolean(labels.proxyEnabled);
  const tls = Boolean(labels.httpsEnabled);
  const portalState = labels.portalState?.trim() || 'Nicht eingerichtet';
  const section = document.createElement('section');
  section.className = 'net-scenario net-scenario--internal';
  section.innerHTML = `
    <header class="net-scenario-header">
      <h3 class="net-scenario-title">Interner Praxisbetrieb</h3>
    </header>
    <p class="net-scenario-lead">Konfigurierter Zugang: ${escapeHtml(labels.baseUrl || 'noch nicht eingerichtet')}.</p>
    <div class="net-flow" aria-label="Konfigurierter interner Datenpfad">
      ${flowStep('Mitarbeiter · Terminal · TV · MFA', { variant: 'neutral' })}
      ${flowArrow('Praxisnetz – Verantwortung der Praxis-IT')}
      ${flowStep('Freigegebene Adresse und Ports', { variant: 'ours', detail: proxy ? `Ausgewählte IPv4: ${ip}` : 'Alle Host-Netzwerkanschlüsse · HTTP :8080' })}
      ${proxy ? flowArrow() + flowStep('Proxy-Dienst', { variant: 'ours', detail: tls ? 'HTTPS :443 · HTTP-Weiterleitung :80' : 'HTTP :80' }) : ''}
      ${flowArrow()}
      ${flowStep('Praxis Flow', { variant: 'ours', detail: 'App · interne Portalfunktion', note: 'Sandbox nur intern erreichbar' })}
    </div>
    <p class="net-flow-footnote">Praxis Flow konfiguriert Docker, Proxy und App. Welche Geräte im Praxisnetz diese Adresse erreichen können, legt Ihre Praxis-IT fest.</p>
    <p class="hint">Laufzustand: ${escapeHtml(labels.operation || 'nicht geprüft')}.<br>Letzte Host-Prüfung: ${escapeHtml(labels.diagnosis || 'nicht geprüft')}.</p>
  `;
  host.append(section);

  const advice = document.createElement('section');
  advice.className = 'net-scenario';
  advice.innerHTML = '<h3 class="net-scenario-title">Hinweise für Ihre Praxis-IT</h3>';
  advice.append(
    buildChecklist([
      'Praxisgeräte müssen die angezeigte Adresse erreichen können. Gast-WLAN-Isolation kann den Zugriff verhindern.',
      'Host-Firewall, Router, VLAN und Netztrennung werden durch Ihre Praxis-IT eingerichtet. Der Manager verändert sie nicht.',
      'Keine Router-Portweiterleitung ins Internet einrichten. Ein korrektes Docker-Binding bestätigt keine Isolation des Praxisnetzes.',
    ]),
  );
  host.append(advice);

  const future = document.createElement('section');
  future.className = 'net-scenario net-scenario--portal';
  future.innerHTML = `
    <h3 class="net-scenario-title">Separater Patientenzugang</h3>
    <p class="net-scenario-lead">Aktueller Status: ${escapeHtml(portalState)}. HTTPS schützt die Verbindung; die tatsächliche Trennung des Patienten- und Praxisnetzes richtet die Praxis-IT ein.</p>
    <p class="hint">Für einen getrennten Patientenzugang sind HTTPS und eine von der Praxis-IT eingerichtete Netzwerkzone erforderlich. Empfohlen wird ein eigenes Applikationssegment oder eine DMZ mit ausschließlich notwendigen Freigaben zum Praxisnetz.</p>
    <p class="hint">Mitarbeiter können die Portalfunktion intern immer nutzen. Die Aktivierung erfolgt in den OPS-Einstellungen.</p>
  `;
  host.append(future);
}

function flowStep(
  label: string,
  options: {
    variant?: 'neutral' | 'ours';
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
