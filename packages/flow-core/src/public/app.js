import { explainVisibility, isVisitVisibleOnSurface } from '/shared/surface-visibility.js';
import { formatAllowedSurfaceIds, ruleForTopicAtSurface, terminalsForTopic, topicsForTerminal } from '/shared/routing-scope.js';
import { canTransition } from '/shared/visit-flow.js';
import {
  confidenceLabels,
  displayLabels,
  errorLabels,
  escortLabels,
  movementLabels,
  statusLabels
} from '/shared/labels.js';
import {
  buildJourneyRoutePreview,
  ruleUsesJourneyRouting,
  stepsForJourneyTemplate,
  visitOperationalLabel
} from '/shared/visit-context.js';

import { mountJourneyAdmin } from './journey-admin.js';

const $ = (id) => document.getElementById(id);
const api = async (url, options) => {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'API_ERROR');
  return payload;
};
const post = (url, body) => api(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

let catalog;
let visits = [];
let events = [];
let activeView = 'queues';
let selectedVisitId = '';
let selectedRuleId = '';

const journeyAdmin = mountJourneyAdmin($('journeyAdminRoot'), {
  onSave: async (payload) => {
    await api(`/api/journey-templates/${payload.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    catalog = await api('/api/catalog');
    journeyAdmin.updateCatalog(catalog);
    renderRuleForm();
  }
});

function sourceChip(field, value, label) {
  return `<span title="${escapeHtml(field)}"><code>${escapeHtml(field)}</code> · ${escapeHtml(value)} · ${escapeHtml(label)}</span>`;
}

function visitSourceChips(visit) {
  const chips = [
    sourceChip('status', visit.status, statusLabels[visit.status] || visit.status),
    sourceChip('movementMode', visit.movementMode, movementLabels[visit.movementMode]),
    sourceChip('locationConfidence', visit.locationConfidence, confidenceLabels[visit.locationConfidence]),
    sourceChip('publicDisplayMode', visit.publicDisplayMode, displayLabels[visit.publicDisplayMode]),
    sourceChip('configuredEscortPolicy', visit.configuredEscortPolicy, escortLabels[visit.configuredEscortPolicy]),
    sourceChip('effectiveEscortPolicy', visit.effectiveEscortPolicy, escortLabels[visit.effectiveEscortPolicy]),
    sourceChip('allowRedirect', visit.allowRedirect ? 'true' : 'false', visit.allowRedirect ? 'MFA darf umleiten' : 'kein Redirect')
  ];
  if (visit.checkInPath === 'mfa_assist') {
    chips.push(sourceChip('checkInPath', 'mfa_assist', 'Hilfe-Button · Zur MFA'));
  }
  if (visit.needsAssistance) {
    chips.push(sourceChip('needsAssistance', 'true', 'Begleitung gemeldet (MFA-Markierung)'));
  }
  if (visit.journeyTemplateId) {
    const label = visit.journeyStepLabel || '—';
    const name = visit.journeyTemplate?.name || visit.journeyTemplateId;
    chips.push(sourceChip('journeyStepIndex', label, `${name} · Schritt ${label}`));
    chips.push(`<span><code>operationalLabel</code> · ${escapeHtml(visitOperationalLabel(visit))}</span>`);
  }
  return chips.join('');
}

function fieldRow(field, value) {
  return `<div><dt><code>${escapeHtml(field)}</code></dt><dd>${escapeHtml(value)}</dd></div>`;
}

async function boot() {
  try {
    catalog = await api('/api/catalog');
    visits = await api('/api/visits');
    selectedRuleId = catalog.routingRules[0]?.id || '';
    fillSelects();
    journeyAdmin.updateCatalog(catalog);
    render();
  } catch (error) {
    showError(error);
  }
}

function fillSelects() {
  syncCheckinSelects();
  fill($('redirectQueue'), catalog.queues, 'id', 'name');
  fill($('redirectLocation'), catalog.locations, 'id', 'name');
  syncRedirectPanel();
}

/** Topic optional; bei Surface-Wechsel nur Topics die an diesem Terminal erlaubt sind. */
function syncCheckinSelects() {
  const surfaceId = $('checkinSurface')?.value;
  const previousTopicId = $('topic')?.value;
  const topics = surfaceId
    ? topicsForTerminal(catalog, surfaceId)
    : catalog.topics.filter((topic) => topic.active);
  fill($('topic'), [{ id: '', name: '— kein Thema —' }, ...topics], 'id', 'name');
  if (previousTopicId != null && topics.some((topic) => topic.id === previousTopicId)) {
    $('topic').value = previousTopicId;
  } else {
    $('topic').value = '';
  }

  const topicId = $('topic')?.value;
  const rule = topicId ? ruleForTopicAtSurface(catalog, topicId, $('checkinSurface')?.value) : undefined;
  const terminals = topicId ? terminalsForTopic(catalog, topicId) : terminalSurfaces();
  const previousSurfaceId = $('checkinSurface')?.value;
  fill($('checkinSurface'), terminals, 'id', 'name');
  if (previousSurfaceId && terminals.some((terminal) => terminal.id === previousSurfaceId)) {
    $('checkinSurface').value = previousSurfaceId;
  } else if (terminals[0]) {
    $('checkinSurface').value = terminals[0].id;
  } else if (!rule) {
    $('checkinSurface').innerHTML = '<option value="">— kein Terminal für dieses Topic —</option>';
  }
}

function terminalSurfaces() {
  return catalog.surfaces.filter((surface) => surface.type === 'terminal' && surface.enabled);
}

function fill(select, rows, valueKey, labelKey) {
  select.innerHTML = rows.map((row) => `<option value="${escapeHtml(row[valueKey])}">${escapeHtml(row[labelKey])}</option>`).join('');
}

async function refresh() {
  visits = await api('/api/visits');
  if (selectedVisitId) events = await api(`/api/visits/${selectedVisitId}/events`);
  render();
}

function selectedVisit() {
  return visits.find((item) => item.id === selectedVisitId);
}

function render() {
  renderCheckinPanel();
  renderGroups();
  renderSurfaces();
  renderRedirectPanel();
  renderEvents();
  renderRuleForm();
}

function renderRedirectPanel() {
  const visit = selectedVisit();
  const allowed = Boolean(visit?.allowRedirect);
  for (const id of [
    'redirectQueue',
    'redirectLocation',
    'redirectMovement',
    'redirectDisplay',
    'redirectLocationSemantics',
    'redirectLastKnown',
    'redirectPreserveInstruction',
    'redirectTerminalInstruction'
  ]) {
    const control = $(id);
    if (control) control.disabled = !allowed;
  }
  const button = $('redirect');
  if (button) button.disabled = !allowed;
  const notice = $('redirectNotice');
  if (!notice) return;
  if (!visit) {
    notice.textContent = 'Visit auswählen, um Redirect zu nutzen.';
    notice.classList.remove('hidden');
    return;
  }
  if (!allowed) {
    notice.textContent = 'Redirect nicht erlaubt (allowRedirect = false, z. B. Hilfe-Button / rule_mfa).';
    notice.classList.remove('hidden');
    return;
  }
  notice.classList.add('hidden');
  syncRedirectPanel();
}

function syncRedirectPanel() {
  const semantics = $('redirectLocationSemantics')?.value || 'instructed';
  const lastKnownRow = $('redirectLastKnownRow');
  const lastKnownSelect = $('redirectLastKnown');
  const preserve = $('redirectPreserveInstruction');
  const instruction = $('redirectTerminalInstruction');

  if (lastKnownRow) {
    lastKnownRow.classList.toggle('hidden', semantics === 'instructed');
  }

  if (lastKnownSelect && semantics !== 'instructed') {
    const targetId = $('redirectLocation')?.value;
    const options = semantics === 'unknown'
      ? [{ id: '', name: '— unbekannt (null) —' }, ...catalog.locations]
      : catalog.locations;
    // Select wird bei jedem sync neu gebaut — PoC ok; manuelle Auswahl geht bei Re-Render verloren.
    fill(lastKnownSelect, options, 'id', 'name');
    if (semantics === 'confirmed' && targetId) {
      lastKnownSelect.value = targetId;
    }
  }

  if (instruction && preserve) {
    const visit = selectedVisit();
    const allowed = Boolean(visit?.allowRedirect);
    instruction.disabled = !allowed || preserve.checked;
    if (preserve.checked) instruction.value = '';
  }
}

function redirectBodyFromForm() {
  const body = {
    queueId: $('redirectQueue').value,
    targetLocationId: $('redirectLocation').value,
    movementMode: $('redirectMovement').value,
    publicDisplayMode: $('redirectDisplay').value,
    locationSemantics: $('redirectLocationSemantics').value,
    staffNote: 'Redirect aus PoC-Dashboard'
  };

  if ($('redirectPreserveInstruction').checked) {
    body.preserveTerminalInstruction = true;
  } else {
    const instruction = $('redirectTerminalInstruction').value.trim();
    if (instruction) body.terminalInstruction = instruction;
  }

  if (body.locationSemantics !== 'instructed') {
    body.lastKnownLocationId = $('redirectLastKnown').value || null;
  }

  return body;
}

function labelLoc(id) {
  const location = catalog.locations.find((item) => item.id === id);
  return location ? `${id} · ${location.name}` : id || '—';
}

function labelQueue(id) {
  const queue = catalog.queues.find((item) => item.id === id);
  return queue ? `${id} · ${queue.name}` : id || '—';
}

function renderCheckinPanel() {
  if (!catalog || !$('checkinContext')) return;
  const surfaceId = $('checkinSurface')?.value || 'terminal_1';
  const surface = catalog.surfaces.find((item) => item.id === surfaceId);
  const location = catalog.locations.find((item) => item.id === surface?.locationId);
  const topicId = $('topic')?.value;
  const needsAssistance = $('needsAssistance')?.checked;
  const rule = topicId ? ruleForTopicAtSurface(catalog, topicId, surfaceId) : undefined;
  const journeyMode = ruleUsesJourneyRouting(rule);
  const journeySteps = journeyMode ? stepsForJourneyTemplate(rule.journeyTemplateId, catalog.journeySteps) : [];
  $('checkinContext').innerHTML = `
    <section class="journey-step">
      <h4>Schritt 1 · Terminal (Surface)</h4>
      <dl>
        ${fieldRow('surfaceId', surface ? `${surface.id} · ${surface.name}` : surfaceId)}
        ${fieldRow('locationId', location ? `${surface.locationId} · ${location.name}` : '—')}
      </dl>
    </section>
    <section class="journey-step">
      <h4>Schritt 2 · Anmeldgrund + Routing</h4>
      ${needsAssistance && topicId ? `<p class="muted">Thema + <code>needsAssistance</code> — nur MFA-Markierung, Routing unverändert.</p>` : ''}
      ${!topicId ? `<p class="muted">Hilfe-Button sendet <code>mfaAssist: true</code> — Routing über System-Topic <code>mfa</code>.</p>` : ''}
      ${rule ? `<dl>
        ${fieldRow('topicId', catalog.topics.find((item) => item.id === topicId)?.name || topicId || '—')}
        ${fieldRow('allowedSurfaceIds', formatAllowedSurfaceIds(rule.allowedSurfaceIds, terminalSurfaces()))}
        ${fieldRow('appliedRoutingRuleId', `${rule.id} · ${rule.name}`)}
        ${fieldRow('routingMode', journeyMode ? 'journey · Route aus Journey-Template' : 'single_step · Route aus Rule initial_*')}
        ${journeyMode
          ? fieldRow('journeyRoute', buildJourneyRoutePreview(journeySteps, catalog.locations, catalog.queues))
          : `${fieldRow('initialLastKnownLocationId', labelLoc(rule.initialLastKnownLocationId))}
             ${fieldRow('initialTargetLocationId', labelLoc(rule.initialTargetLocationId))}
             ${fieldRow('initialQueueId', labelQueue(rule.initialQueueId))}
             ${fieldRow('initialMovementMode', rule.initialMovementMode)}`}
      </dl>` : (!topicId ? '' : '<p class="muted">Thema wählen oder Hilfe-Button nutzen.</p>')}
    </section>
    <p class="muted journey-note">Mit Journey ersetzt das Template den operativen Route-Teil der Rule (initial_*). Policy: Escort, Redirect, Terminals.</p>
  `;
}

function journeyLine(visit) {
  const surface = catalog.surfaces.find((item) => item.id === visit.lastSurfaceId);
  const surfaceLoc = catalog.locations.find((item) => item.id === surface?.locationId);
  const from = surfaceLoc?.name || visit.lastSurfaceId || '?';
  const known = visit.lastKnownLocation?.name || visit.lastKnownLocationId || '?';
  const target = visit.targetLocation?.name || visit.targetLocationId || '?';
  return `${from} (Check-in) → lastKnown: ${known} → target: ${target}`;
}

function renderGroups() {
  const groups = new Map();
  for (const visit of visits) {
    const key = activeView === 'queues' ? visit.queueId || 'none' : activeView === 'locations' ? visit.lastKnownLocationId || 'unknown' : visit.primaryTopicId || 'none';
    groups.set(key, [...(groups.get(key) || []), visit]);
  }
  $('groups').innerHTML = [...groups.entries()].map(([id, items]) => `
    <section class="group">
      <h2>${labelFor(activeView, id)} <span>${items.length}</span></h2>
      ${items.map(renderVisit).join('')}
    </section>
  `).join('') || '<p class="muted">Noch keine aktiven Visits.</p>';
}

function renderVisit(visit) {
  return `
    <article class="visit ${visit.id === selectedVisitId ? 'selected' : ''}" data-visit="${visit.id}">
      <div class="visit-head">
        <strong>${visit.queueNumber}</strong>
        <span style="--topic-color:${visit.topic?.color || '#64748b'}">${escapeHtml(visit.topic?.name || 'Ohne Thema')}</span>
        <small><code>primaryTopicId</code> · ${escapeHtml(visit.primaryTopicId || 'offen')}</small>
      </div>
      <p class="visit-state"><strong>${escapeHtml(visitOperationalLabel(visit))}</strong></p>
      <p>${locationText(visit)} · Ziel: ${escapeHtml(visit.targetLocation?.name || 'offen')} · Queue: ${escapeHtml(visit.queue?.name || 'offen')}</p>
      <p class="terminal-line"><code>terminalInstruction</code> · ${escapeHtml(visit.terminalInstruction)}</p>
      <div class="chips">${visitSourceChips(visit)}</div>
      <div class="actions">
        <button data-action="call" data-id="${visit.id}" ${canTransition(visit, 'call') ? '' : 'disabled'}>Aufrufen</button>
        <button data-action="arrive" data-id="${visit.id}" ${canTransition(visit, 'arrive') ? '' : 'disabled'}>Ankunft</button>
        <button data-action="start" data-id="${visit.id}" ${canTransition(visit, 'start') ? '' : 'disabled'}>Start</button>
        <button data-action="done" data-id="${visit.id}" ${canTransition(visit, 'done') ? '' : 'disabled'}>Fertig</button>
      </div>
    </article>
  `;
}

function surfaceRouteLabel(visit) {
  const from = visit.lastKnownLocation?.publicName || visit.lastKnownLocation?.name || '';
  const to = visit.targetLocation?.publicName || visit.targetLocation?.name || '';
  // Route nur nach explizitem Aufruf — nicht schon weil Rule lastKnown ≠ target hat
  if (visit.status === 'called' && from && to && from !== to) {
    return `${from} → ${to}`;
  }
  return '';
}

function renderSurfaces() {
  const ids = ['waiting_tv', 'panel_vaccine', 'panel_lab', 'panel_room_1'];
  $('surfaces').innerHTML = ids.map((surfaceId) => {
    const surface = catalog.surfaces.find((item) => item.id === surfaceId);
    const rules = catalog.surfaceDisplayRules.filter((rule) => rule.surfaceId === surfaceId);
    const rows = visits
      .map((visit) => ({ visit, explanation: explainVisibility(visit, surface, rules) }))
      .filter(({ explanation }) => explanation.visible);
    return `<article><h3>${surface.name}</h3>${rows.map(({ visit, explanation }) => `
      <div class="surface-row" title="${escapeHtml(explanation.reason)}">
        <strong>${visit.queueNumber}</strong>
        <span>${escapeHtml(surfaceRouteLabel(visit))}</span>
        <small class="muted">${escapeHtml(explanation.reason)}</small>
      </div>
    `).join('') || '<p class="muted">Keine passenden Visits</p>'}</article>`;
  }).join('');
}

function renderEventLine(event) {
  const note = event.note ? ` · ${event.note}` : '';
  return `<li><strong>${event.type}</strong><span>${event.toStatus || ''}${escapeHtml(note)}</span><small>${new Date(event.createdAt).toLocaleTimeString('de-DE')}</small></li>`;
}

function eventsForDisplay(allEvents) {
  const used = new Set();
  /** @type {Array<{ kind: 'event', event: typeof allEvents[0] } | { kind: 'group', events: typeof allEvents }>} */
  const items = [];
  for (let index = 0; index < allEvents.length; index++) {
    if (used.has(index)) continue;
    const event = allEvents[index];
    if (event.correlationId) {
      const group = [];
      for (let scan = index; scan < allEvents.length; scan++) {
        if (allEvents[scan].correlationId === event.correlationId) {
          group.push(allEvents[scan]);
          used.add(scan);
        }
      }
      items.push({ kind: 'group', events: group });
    } else {
      items.push({ kind: 'event', event });
    }
  }
  return items;
}

function renderEvents() {
  if (!events.length) {
    $('events').innerHTML = '<li class="muted">Visit auswählen, um Events zu sehen.</li>';
    return;
  }

  $('events').innerHTML = eventsForDisplay(events).map((item) => {
    if (item.kind === 'group') {
      return `<li class="event-group"><span class="event-group-label">Redirect · Journey verlassen</span><ul class="event-group-items">${item.events.map(renderEventLine).join('')}</ul></li>`;
    }
    return renderEventLine(item.event);
  }).join('');
}

function renderRuleForm({ journeyTemplateIdOverride } = {}) {
  const rule = catalog.routingRules.find((item) => item.id === selectedRuleId);
  if (!rule) return;
  const topic = catalog.topics.find((item) => item.id === rule.topicId);
  const terminals = terminalSurfaces();
  const effectiveJourneyId = journeyTemplateIdOverride !== undefined
    ? (journeyTemplateIdOverride || undefined)
    : rule.journeyTemplateId;
  const effectiveRule = { ...rule, journeyTemplateId: effectiveJourneyId };
  const journeyMode = ruleUsesJourneyRouting(effectiveRule);
  const journeySteps = journeyMode ? stepsForJourneyTemplate(effectiveJourneyId, catalog.journeySteps) : [];

  $('ruleForm').innerHTML = `
    <p class="rule-preview" id="rulePreview">${escapeHtml(buildRuleJourneyPreview(effectiveRule))}</p>

    <section class="rule-block">
      <h4>0 · Anliegen &amp; Routing-Modus</h4>
      <label class="rule-field wide">
        ${ruleFieldLabel('routingRuleId', 'Routing-Regel wählen', 'Welche Regel bearbeitet wird')}
        <select id="rule">${catalog.routingRules.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === selectedRuleId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select>
      </label>
      <dl>
        ${fieldRow('topicId', topic ? `${rule.topicId} · ${topic.name}` : rule.topicId)}
        ${fieldRow('routingMode', journeyMode ? 'journey' : 'single_step')}
      </dl>
      <label class="rule-field wide">
        ${ruleFieldLabel('journeyTemplateId', 'Journey-Vorlage', 'Gesetzt = Journey ersetzt operative Route (initial_* wird ignoriert)')}
        <select id="ruleJourney">
          <option value="" ${!effectiveJourneyId ? 'selected' : ''}>— Einfacher Schritt (single_step) —</option>
          ${catalog.journeyTemplates.filter((item) => item.active).map((item) => `
            <option value="${escapeHtml(item.id)}" ${item.id === effectiveJourneyId ? 'selected' : ''}>${escapeHtml(item.name)}</option>
          `).join('')}
        </select>
      </label>
      ${journeyMode ? `
        <p class="rule-journey-line">${escapeHtml(buildJourneyRoutePreview(journeySteps, catalog.locations, catalog.queues))}</p>
        <p class="rule-help wide">Policy bleibt in der Rule: Terminals, Escort, Redirect. Route bearbeiten → Journey-Admin unten.</p>
      ` : ''}
    </section>

    <section class="rule-block">
      <h4>1 · Check-in — Terminals &amp; Policy</h4>
      <div class="wide terminal-picks">
        ${ruleFieldLabel('allowedSurfaceIds', 'An welchen Terminals?', 'Keine Auswahl = alle Terminals')}
        ${terminals.map((terminal) => `
          <label class="check">
            <input class="ruleTerminal" type="checkbox" value="${escapeHtml(terminal.id)}" ${ruleTerminalChecked(rule, terminal.id) ? 'checked' : ''} />
            ${escapeHtml(terminal.name)} <code>${escapeHtml(terminal.id)}</code>
          </label>
        `).join('')}
      </div>
      <label class="rule-field wide ${journeyMode ? 'hidden' : ''}" id="ruleTerminalBlock">
        ${ruleFieldLabel('terminalInstructionTemplate', 'Text am Terminal', 'Nur single_step — bei Journey aus movementMode abgeleitet')}
        <textarea id="ruleText">${escapeHtml(rule.terminalInstructionTemplate)}</textarea>
      </label>
      <div class="rule-grid">
        <label class="rule-field">
          ${ruleFieldLabel('escortPolicy', 'Begleitung')}
          <select id="ruleEscort">${escortOption('none', rule)}${escortOption('recommended', rule)}${escortOption('required', rule)}</select>
        </label>
        <label class="check rule-field">
          <input id="ruleRedirect" type="checkbox" ${rule.allowRedirect !== false ? 'checked' : ''} />
          ${ruleFieldLabel('allowRedirect', 'MFA darf umleiten', 'Standard: true; false z. B. rule_mfa (Hilfe-Button)')}
        </label>
      </div>
    </section>

    <section class="rule-block ${journeyMode ? 'hidden' : ''}" id="ruleRouteBlock">
      <h4>2 · Route — ein Schritt (single_step)</h4>
      <p class="rule-journey-line" id="ruleOrtLine">${escapeHtml(buildRuleOrtLine(rule))}</p>
      <div class="rule-grid">
        ${ruleFieldSelect('initialLastKnownLocationId', 'Wartebereich nach Check-in', 'ruleLast', catalog.locations, rule.initialLastKnownLocationId, 'Ort im System (lastKnown)')}
        ${ruleFieldSelect('initialTargetLocationId', 'Nächstes Ziel', 'ruleTarget', catalog.locations, rule.initialTargetLocationId, 'targetLocationId')}
        ${ruleFieldSelect('initialQueueId', 'Arbeitsliste', 'ruleQueue', catalog.queues, rule.initialQueueId, 'queueId')}
      </div>
    </section>

    <section class="rule-block ${journeyMode ? 'hidden' : ''}" id="ruleMovementBlock">
      <h4>3 · Weg &amp; Anzeige (single_step)</h4>
      <div class="rule-grid">
        <label class="rule-field">
          ${ruleFieldLabel('initialMovementMode', 'Wie weiter?')}
          <select id="ruleMovement">${movementOption('call', rule)}${movementOption('self_go', rule)}${movementOption('pickup', rule)}</select>
        </label>
        <label class="rule-field">
          ${ruleFieldLabel('publicDisplayMode', 'Wartezimmer-TV', 'Nur public_display-Surfaces')}
          <select id="ruleDisplay">${displayOption('visible', rule)}${displayOption('hidden', rule)}${displayOption('call_only', rule)}</select>
        </label>
        <label class="rule-field wide">
          ${ruleFieldLabel('initialLocationConfidence', 'Ortssicherheit')}
          <select id="ruleConfidence">${confidenceOption('assumed', rule)}${confidenceOption('instructed', rule)}${confidenceOption('confirmed', rule)}</select>
        </label>
      </div>
    </section>

    <button id="saveRule" class="primary">RoutingRule speichern</button>
  `;
}

function ruleFieldLabel(technical, friendly, hint = '') {
  return `<span class="rule-field-label"><strong>${escapeHtml(friendly)}</strong> <code>${escapeHtml(technical)}</code>${hint ? `<small class="muted">${escapeHtml(hint)}</small>` : ''}</span>`;
}

function ruleFieldSelect(technical, friendly, id, rows, value, hint = '') {
  return `<label class="rule-field">${ruleFieldLabel(technical, friendly, hint)}<select id="${id}">${rows.map((row) => `<option value="${row.id}" ${row.id === value ? 'selected' : ''}>${escapeHtml(row.name)}</option>`).join('')}</select></label>`;
}

function locName(id) {
  return catalog.locations.find((item) => item.id === id)?.name || id || '?';
}

function buildRuleOrtLine(rule) {
  const last = locName(rule.initialLastKnownLocationId);
  const target = locName(rule.initialTargetLocationId);
  const queue = catalog.queues.find((item) => item.id === rule.initialQueueId)?.name || rule.initialQueueId || '?';
  return `Wartet in: ${last}  →  Ziel: ${target}  ·  Liste: ${queue}`;
}

function buildRuleJourneyPreview(rule) {
  const topic = catalog.topics.find((item) => item.id === rule.topicId);
  const terminals = formatAllowedSurfaceIds(rule.allowedSurfaceIds, terminalSurfaces());
  if (ruleUsesJourneyRouting(rule)) {
    const steps = stepsForJourneyTemplate(rule.journeyTemplateId, catalog.journeySteps);
    const template = catalog.journeyTemplates.find((item) => item.id === rule.journeyTemplateId);
    return `Journey · ${template?.name || rule.journeyTemplateId} · Terminal (${terminals}) · ${topic?.name || rule.topicId} · ${buildJourneyRoutePreview(steps, catalog.locations, catalog.queues)}`;
  }
  const movement = movementLabels[rule.initialMovementMode] || rule.initialMovementMode;
  const tv = rule.publicDisplayMode === 'hidden' ? 'nicht am WZ-TV' : rule.publicDisplayMode === 'call_only' ? 'WZ-TV nur nach Aufruf' : 'am WZ-TV sichtbar';
  return `Single-Step · Terminal (${terminals}) · ${topic?.name || rule.topicId} · ${buildRuleOrtLine(rule)} · ${movement} · ${tv}`;
}

function draftRuleFromForm(rule) {
  const journeyTemplateId = $('ruleJourney')?.value || null;
  const journeyMode = Boolean(journeyTemplateId);
  return {
    ...rule,
    journeyTemplateId,
    allowedSurfaceIds: selectedAllowedSurfaceIds(),
    escortPolicy: $('ruleEscort')?.value ?? rule.escortPolicy,
    allowRedirect: $('ruleRedirect')?.checked ?? rule.allowRedirect,
    ...(journeyMode ? {} : {
      initialLastKnownLocationId: $('ruleLast')?.value ?? rule.initialLastKnownLocationId,
      initialTargetLocationId: $('ruleTarget')?.value ?? rule.initialTargetLocationId,
      initialQueueId: $('ruleQueue')?.value ?? rule.initialQueueId,
      initialMovementMode: $('ruleMovement')?.value ?? rule.initialMovementMode,
      initialLocationConfidence: $('ruleConfidence')?.value ?? rule.initialLocationConfidence,
      publicDisplayMode: $('ruleDisplay')?.value ?? rule.publicDisplayMode,
      terminalInstructionTemplate: $('ruleText')?.value ?? rule.terminalInstructionTemplate
    })
  };
}

function updateRulePreview() {
  const rule = catalog.routingRules.find((item) => item.id === selectedRuleId);
  if (!rule || !$('rulePreview')) return;
  const draft = draftRuleFromForm(rule);
  $('rulePreview').textContent = buildRuleJourneyPreview(draft);
  const ortLine = $('ruleOrtLine');
  if (ortLine) ortLine.textContent = buildRuleOrtLine(draft);
}

function movementOption(value, rule) { return `<option value="${value}" ${rule.initialMovementMode === value ? 'selected' : ''}>${value} · ${movementLabels[value]}</option>`; }
function displayOption(value, rule) { return `<option value="${value}" ${rule.publicDisplayMode === value ? 'selected' : ''}>${value} · ${displayLabels[value]}</option>`; }
function escortOption(value, rule) { return `<option value="${value}" ${rule.escortPolicy === value ? 'selected' : ''}>${value} · ${escortLabels[value]}</option>`; }
function confidenceOption(value, rule) {
  return `<option value="${value}" ${rule.initialLocationConfidence === value ? 'selected' : ''}>${value} · ${confidenceLabels[value]}</option>`;
}

function ruleTerminalChecked(rule, terminalId) {
  return Boolean(rule.allowedSurfaceIds?.includes(terminalId));
}

function selectedAllowedSurfaceIds() {
  const checked = [...document.querySelectorAll('.ruleTerminal:checked')].map((input) => input.value);
  return checked.length ? checked : null;
}

function surfaceVisits(surfaceId) {
  const surface = catalog.surfaces.find((item) => item.id === surfaceId);
  const rules = catalog.surfaceDisplayRules.filter((rule) => rule.surfaceId === surfaceId);
  return visits.filter((visit) => isVisitVisibleOnSurface(visit, surface, rules));
}

function labelFor(view, id) {
  if (view === 'queues') return catalog.queues.find((item) => item.id === id)?.name || 'Ohne Queue';
  if (view === 'locations') return catalog.locations.find((item) => item.id === id)?.name || 'Unbekannter Ort';
  return catalog.topics.find((item) => item.id === id)?.name || 'Ohne Thema';
}

function locationText(visit) {
  const confidence = visit.locationConfidence === 'confirmed' ? 'bestätigt in' : visit.locationConfidence === 'instructed' ? 'angewiesen zu' : 'angenommen in';
  return `${confidence} ${visit.lastKnownLocation?.name || 'unbekannt'}`;
}

function showError(error) {
  const message = error instanceof Error ? error.message : String(error);
  $('error').textContent = errorLabels[message] || message;
  $('error').classList.remove('hidden');
}
function clearError() { $('error').classList.add('hidden'); }
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
}

function buildCheckInBody({ mfaAssist = false } = {}) {
  if (mfaAssist) {
    return {
      surfaceId: $('checkinSurface').value,
      mfaAssist: true,
      displayName: $('displayName').value || undefined
    };
  }

  const topicId = $('topic').value || undefined;
  if (!topicId) throw new Error('CHECKIN_TOPIC_OR_MFA_ASSIST_REQUIRED');

  return {
    surfaceId: $('checkinSurface').value,
    topicId,
    displayName: $('displayName').value || undefined,
    needsAssistance: $('needsAssistance').checked
  };
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  const visitCard = event.target.closest('.visit');
  try {
    clearError();
    if (button?.id === 'refresh') await refresh();
    if (button?.id === 'checkin' || button?.id === 'checkinAssistOnly') {
      const visit = await post('/api/check-in', buildCheckInBody({ mfaAssist: button.id === 'checkinAssistOnly' }));
      selectedVisitId = visit.id;
      $('displayName').value = '';
      $('needsAssistance').checked = false;
      $('lastCheckin').innerHTML = `
        <div class="ticket">
          <span>Schritt C · Visit nach Check-in + Routing</span>
          <strong>${visit.queueNumber}</strong>
          <p class="journey-line">${escapeHtml(journeyLine(visit))}</p>
          <dl>
            ${fieldRow('lastSurfaceId', visit.lastSurfaceId || '—')}
            ${fieldRow('primaryTopicId', visit.topic?.name || visit.primaryTopicId || 'offen')}
            ${fieldRow('status', visitOperationalLabel(visit))}
            ${fieldRow('statusCode', visit.status)}
            ${fieldRow('terminalInstruction', visit.terminalInstruction)}
            ${fieldRow('movementMode', `${visit.movementMode} · ${movementLabels[visit.movementMode]}`)}
            ${fieldRow('locationConfidence', visit.locationConfidence)}
            ${fieldRow('publicDisplayMode', `${visit.publicDisplayMode} · ${displayLabels[visit.publicDisplayMode]}`)}
            ${fieldRow('queueLaneCode', visit.queueLaneCode)}
            ${fieldRow('queueSequence', visit.queueSequence)}
            ${fieldRow('checkInPath', visit.checkInPath || 'topic')}
            ${fieldRow('needsAssistance', visit.needsAssistance ? 'true' : 'false')}
            ${fieldRow('configuredEscortPolicy', `${visit.configuredEscortPolicy} · ${escortLabels[visit.configuredEscortPolicy]}`)}
            ${fieldRow('effectiveEscortPolicy', `${visit.effectiveEscortPolicy} · ${escortLabels[visit.effectiveEscortPolicy]}`)}
            ${fieldRow('queueId', visit.queue?.name ? `${visit.queueId} · ${visit.queue.name}` : visit.queueId || 'offen')}
            ${fieldRow('targetLocationId', visit.targetLocation?.name ? `${visit.targetLocationId} · ${visit.targetLocation.name}` : visit.targetLocationId || 'offen')}
            ${fieldRow('lastKnownLocationId', visit.lastKnownLocation?.name ? `${visit.lastKnownLocationId} · ${visit.lastKnownLocation.name}` : visit.lastKnownLocationId || 'unbekannt')}
          </dl>
        </div>`;
      await refresh();
    }
    if (button?.dataset.action) {
      await post(`/api/visits/${button.dataset.id}/${button.dataset.action}`, {});
      await refresh();
    } else if (button?.id === 'redirect' && selectedVisitId) {
      await post(`/api/visits/${selectedVisitId}/redirect`, redirectBodyFromForm());
      await refresh();
    } else if (button?.id === 'saveRule') {
      const rule = catalog.routingRules.find((item) => item.id === selectedRuleId);
      const draft = draftRuleFromForm(rule);
      await api(`/api/routing-rules/${selectedRuleId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: rule.id,
          topicId: rule.topicId,
          name: rule.name,
          active: rule.active,
          initialLastKnownLocationId: draft.initialLastKnownLocationId,
          initialTargetLocationId: draft.initialTargetLocationId,
          initialQueueId: draft.initialQueueId,
          initialMovementMode: draft.initialMovementMode ?? rule.initialMovementMode,
          initialLocationConfidence: draft.initialLocationConfidence ?? rule.initialLocationConfidence,
          publicDisplayMode: draft.publicDisplayMode ?? rule.publicDisplayMode,
          terminalInstructionTemplate: draft.terminalInstructionTemplate ?? rule.terminalInstructionTemplate,
          escortPolicy: draft.escortPolicy,
          requiresReceptionConfirmation: rule.requiresReceptionConfirmation,
          allowRedirect: draft.allowRedirect,
          allowedSurfaceIds: draft.allowedSurfaceIds,
          journeyTemplateId: draft.journeyTemplateId
        })
      });
      catalog = await api('/api/catalog');
      syncCheckinSelects();
      journeyAdmin.updateCatalog(catalog);
      render();
    } else if (visitCard && !button) {
      selectedVisitId = visitCard.dataset.visit;
      events = await api(`/api/visits/${selectedVisitId}/events`);
      render();
    }
  } catch (error) {
    showError(error);
  }
});

document.querySelectorAll('.tabs button').forEach((button) => {
  button.addEventListener('click', () => {
    activeView = button.dataset.view;
    document.querySelectorAll('.tabs button').forEach((item) => item.classList.toggle('active', item === button));
    renderGroups();
  });
});

document.querySelector('.rule-editor')?.addEventListener('change', (event) => {
  if (event.target.id === 'rule') {
    selectedRuleId = event.target.value;
    renderRuleForm();
    return;
  }
  if (event.target.id === 'ruleJourney') {
    renderRuleForm({ journeyTemplateIdOverride: event.target.value || null });
    return;
  }
  if (event.target.closest('#ruleForm')) updateRulePreview();
});
document.querySelector('.rule-editor')?.addEventListener('input', (event) => {
  if (event.target.closest('#ruleForm')) updateRulePreview();
});

for (const id of ['checkinSurface', 'topic', 'needsAssistance']) {
  $(id).addEventListener('change', () => {
    syncCheckinSelects();
    renderCheckinPanel();
  });
}

document.querySelector('.redirect')?.addEventListener('change', (event) => {
  const { id } = event.target;
  if ([
    'redirectLocationSemantics',
    'redirectLocation',
    'redirectPreserveInstruction'
  ].includes(id)) {
    syncRedirectPanel();
  }
});

boot();
