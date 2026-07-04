import type { NetworkBindingCheck } from '../shared/host-status.js';

export function renderNetworkBindingChecks(
  host: HTMLElement,
  checks: NetworkBindingCheck[] | null | undefined,
): void {
  host.replaceChildren();

  if (!checks || checks.length === 0) {
    host.hidden = true;
    return;
  }

  host.hidden = false;

  const title = document.createElement('h3');
  title.className = 'wizard-subheading network-bindings-title';
  title.textContent = 'Bindung & Listener (Host)';
  host.append(title);

  const intro = document.createElement('p');
  intro.className = 'maintenance-hint';
  intro.textContent =
    'Prüft am Host Interfaces, IPs und Ports — ob die Konfiguration zum laufenden Stack passt. Kein Test, ob Patienten-Traffic wirklich nur über den Gast-Anschluss kommt (dafür VLAN/Routing in der Praxis).';
  host.append(intro);

  const list = document.createElement('ul');
  list.className = 'wizard-checklist network-bindings-list';
  for (const check of checks) {
    const li = document.createElement('li');
    li.className = check.ok ? 'network-binding-ok' : 'network-binding-bad';
    li.textContent = `${check.ok ? '✓' : '✗'} ${check.message}`;
    list.append(li);
    if (check.detail) {
      const detail = document.createElement('li');
      detail.className = 'network-binding-detail';
      detail.textContent = check.detail;
      list.append(detail);
    }
  }
  host.append(list);
}
