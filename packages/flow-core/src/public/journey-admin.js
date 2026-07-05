/**
 * Journey-Admin UI — mountbare Komponente für Templates und Steps.
 *
 * Geplanter Export (zusammen mit `shared/journey.ts`, `shared/visit-context.ts`,
 * relevante Typen in `types.ts`). Enthält bewusst lokale Kopien (`stepsForTemplate`,
 * `buildPreview`, `escapeHtml`), damit die Komponente ohne `app.js` in ein anderes
 * Projekt wandern kann.
 */

import { movementLabels, displayLabels, advanceLabels } from '/shared/labels.js';

/**
 * Wiederverwendbare Journey-Admin-Komponente.
 * Mount einmal, dann `updateCatalog()` bei Datenänderung.
 *
 * @param {HTMLElement} root
 * @param {{ onSave?: (payload: object) => Promise<void> }} [options]
 */
export function mountJourneyAdmin(root, { onSave } = {}) {
  let catalog = null;
  let selectedTemplateId = '';

  root.addEventListener('change', onRootChange);
  root.addEventListener('input', onRootInput);
  root.addEventListener('click', onRootClick);

  function updateCatalog(nextCatalog) {
    catalog = nextCatalog;
    const exists = catalog.journeyTemplates.some((item) => item.id === selectedTemplateId);
    if (!exists) {
      selectedTemplateId = catalog.journeyTemplates[0]?.id || '';
    }
    render();
  }

  function getSelectedTemplateId() {
    return selectedTemplateId;
  }

  function render() {
    if (!catalog) {
      root.innerHTML = '<p class="muted">Kein Katalog geladen.</p>';
      return;
    }

    const templates = catalog.journeyTemplates;
    const template = templates.find((item) => item.id === selectedTemplateId);
    if (!template) {
      root.innerHTML = '<p class="muted">Keine Journey-Templates vorhanden.</p>';
      return;
    }

    const steps = stepsForTemplate(template.id);
    const linkedRules = catalog.routingRules.filter((rule) => rule.journeyTemplateId === template.id && rule.active);
    const topic = catalog.topics.find((item) => item.id === template.topicId);

    root.innerHTML = `
      <p class="journey-admin-preview" data-role="preview">${escapeHtml(buildPreview(template, steps, topic))}</p>

      <section class="journey-admin-block">
        <h4>Vorlage</h4>
        <label class="journey-admin-field wide">
          ${fieldLabel('journeyTemplateId', 'Journey wählen')}
          <select data-role="template-select">
            ${templates.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === template.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}
          </select>
        </label>
        <div class="journey-admin-grid">
          <label class="journey-admin-field">
            ${fieldLabel('name', 'Anzeigename')}
            <input data-role="template-name" value="${escapeHtml(template.name)}" />
          </label>
          <label class="journey-admin-field">
            ${fieldLabel('topicId', 'Anliegen (optional)')}
            <select data-role="template-topic">
              <option value="">— keins —</option>
              ${catalog.topics.filter((item) => item.active && item.id !== 'mfa').map((item) => `
                <option value="${escapeHtml(item.id)}" ${item.id === template.topicId ? 'selected' : ''}>${escapeHtml(item.name)}</option>
              `).join('')}
            </select>
          </label>
          <label class="journey-admin-check">
            <input data-role="template-active" type="checkbox" ${template.active ? 'checked' : ''} />
            ${fieldLabel('active', 'Aktiv')}
          </label>
        </div>
        <dl class="journey-admin-meta">
          ${metaRow('topicId', topic ? `${template.topicId} · ${topic.name}` : template.topicId || '—')}
          ${metaRow('linkedRules', linkedRules.length ? linkedRules.map((rule) => `${rule.id} · ${rule.name}`).join(', ') : '—')}
        </dl>
      </section>

      <section class="journey-admin-block">
        <h4>Schritte <small class="muted">Schritt 1 = erster Hop · advanceOn = wann der nächste Schritt startet</small></h4>
        <div class="journey-admin-steps" data-role="steps">
          ${steps.map((step, index) => renderStep(step, index)).join('')}
        </div>
        <button type="button" class="ghost" data-action="add-step">+ Schritt</button>
      </section>

      <button type="button" class="primary" data-action="save">Journey speichern</button>
    `;
  }

  function renderStep(step, index) {
    return `
      <article class="journey-admin-step" data-step-index="${index}" data-step-id="${escapeHtml(step.id || '')}">
        <header>
          <strong>Schritt ${index + 1}</strong>
          <button type="button" class="ghost" data-action="remove-step" data-step-index="${index}" title="Schritt entfernen">×</button>
        </header>
        <div class="journey-admin-grid">
          <label class="journey-admin-field">
            ${fieldLabel('targetLocationId', 'Ziel')}
            <select data-field="targetLocationId">${locationOptions(step.targetLocationId)}</select>
          </label>
          <label class="journey-admin-field">
            ${fieldLabel('queueId', 'Liste')}
            <select data-field="queueId">${queueOptions(step.queueId)}</select>
          </label>
          <label class="journey-admin-field">
            ${fieldLabel('movementMode', 'Weg')}
            <select data-field="movementMode">${movementOptions(step.movementMode)}</select>
          </label>
          <label class="journey-admin-field">
            ${fieldLabel('publicDisplayMode', 'WZ-TV')}
            <select data-field="publicDisplayMode">${displayOptions(step.publicDisplayMode)}</select>
          </label>
          <label class="journey-admin-field wide">
            ${fieldLabel('instructionText', 'Hinweis (optional)')}
            <input data-field="instructionText" type="text" value="${escapeHtml(step.instructionText || '')}" placeholder="Leer = Default aus Weg + Ziel" />
          </label>
          <label class="journey-admin-field">
            ${fieldLabel('advanceOn', 'Nächster Schritt')}
            <select data-field="advanceOn">${advanceOptions(step.advanceOn)}</select>
          </label>
        </div>
      </article>
    `;
  }

  /**
   * Lokale Kopie — absichtlich nicht aus visit-context importiert (Journey-Export).
   * @param {string} templateId
   */
  function stepsForTemplate(templateId) {
    return catalog.journeySteps
      .filter((step) => step.templateId === templateId)
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }

  function buildPreview(template, steps, topic) {
    const hopLabels = steps.map((step, index) => {
      const target = catalog.locations.find((item) => item.id === step.targetLocationId)?.name || step.targetLocationId || '?';
      const mode = movementLabels[step.movementMode] || step.movementMode;
      const trigger = advanceLabels[step.advanceOn] || step.advanceOn;
      return `${index + 1}: ${target} (${mode}, weiter ${trigger})`;
    });
    const topicLabel = topic?.name || template.topicId || 'ohne Topic';
    return `${template.name} · ${topicLabel} · ${hopLabels.join(' → ') || 'keine Schritte'}`;
  }

  function collectPayload() {
    const template = catalog.journeyTemplates.find((item) => item.id === selectedTemplateId);
    if (!template) throw new Error('JOURNEY_TEMPLATE_NOT_FOUND');

    const stepNodes = [...root.querySelectorAll('[data-role="steps"] .journey-admin-step')];
    const steps = stepNodes.map((node, index) => ({
      id: node.dataset.stepId && !node.dataset.stepId.startsWith('draft_') ? node.dataset.stepId : undefined,
      sortOrder: index,
      targetLocationId: node.querySelector('[data-field="targetLocationId"]')?.value || null,
      queueId: node.querySelector('[data-field="queueId"]')?.value || null,
      movementMode: node.querySelector('[data-field="movementMode"]')?.value,
      publicDisplayMode: node.querySelector('[data-field="publicDisplayMode"]')?.value,
      advanceOn: node.querySelector('[data-field="advanceOn"]')?.value,
      instructionText: node.querySelector('[data-field="instructionText"]')?.value?.trim() || undefined
    }));

    return {
      id: template.id,
      name: root.querySelector('[data-role="template-name"]')?.value?.trim() || template.name,
      topicId: root.querySelector('[data-role="template-topic"]')?.value || null,
      active: root.querySelector('[data-role="template-active"]')?.checked ?? true,
      steps
    };
  }

  function updatePreview() {
    const preview = root.querySelector('[data-role="preview"]');
    if (!preview || !catalog) return;
    const template = catalog.journeyTemplates.find((item) => item.id === selectedTemplateId);
    if (!template) return;
    const draft = collectPayload();
    const topic = catalog.topics.find((item) => item.id === draft.topicId);
    preview.textContent = buildPreview({ ...template, name: draft.name, topicId: draft.topicId }, draft.steps, topic);
  }

  function onRootChange(event) {
    if (event.target.matches('[data-role="template-select"]')) {
      selectedTemplateId = event.target.value;
      render();
      return;
    }
    if (event.target.closest('[data-role="steps"]') || event.target.matches('[data-role="template-topic"]')) {
      updatePreview();
    }
  }

  function onRootInput(event) {
    if (event.target.matches('[data-role="template-name"]')) updatePreview();
  }

  async function onRootClick(event) {
    const button = event.target.closest('button');
    if (!button || !catalog) return;

    if (button.dataset.action === 'add-step') {
      const steps = stepsForTemplate(selectedTemplateId);
      const last = steps[steps.length - 1];
      steps.push({
        sortOrder: steps.length,
        targetLocationId: last?.targetLocationId || catalog.locations[0]?.id,
        queueId: last?.queueId || null,
        movementMode: last?.movementMode || 'call',
        publicDisplayMode: last?.publicDisplayMode || 'visible',
        advanceOn: 'arrive'
      });
      catalog = {
        ...catalog,
        journeySteps: [
          ...catalog.journeySteps.filter((step) => step.templateId !== selectedTemplateId),
          ...steps.map((step, index) => ({
            ...step,
            id: step.id && !step.id.startsWith('draft_') ? step.id : `draft_${index}`,
            templateId: selectedTemplateId,
          }))
        ]
      };
      render();
      updatePreview();
      return;
    }

    if (button.dataset.action === 'remove-step') {
      const index = Number(button.dataset.stepIndex);
      const steps = stepsForTemplate(selectedTemplateId).filter((_, i) => i !== index);
      catalog = {
        ...catalog,
        journeySteps: [
          ...catalog.journeySteps.filter((step) => step.templateId !== selectedTemplateId),
          ...steps.map((step, i) => ({
            ...step,
            sortOrder: i,
            id: step.id && !step.id.startsWith('draft_') ? step.id : `draft_${i}`,
            templateId: selectedTemplateId,
          }))
        ]
      };
      render();
      updatePreview();
      return;
    }

    if (button.dataset.action === 'save' && onSave) {
      await onSave(collectPayload());
    }
  }

  function locationOptions(value) {
    return catalog.locations.map((item) => `
      <option value="${escapeHtml(item.id)}" ${item.id === value ? 'selected' : ''}>${escapeHtml(item.name)}</option>
    `).join('');
  }

  function queueOptions(value) {
    const rows = ['<option value="">— keine —</option>', ...catalog.queues.map((item) => `
      <option value="${escapeHtml(item.id)}" ${item.id === value ? 'selected' : ''}>${escapeHtml(item.name)}</option>
    `)];
    return rows.join('');
  }

  function movementOptions(value) {
    return Object.entries(movementLabels).map(([key, label]) => `
      <option value="${key}" ${key === value ? 'selected' : ''}>${key} · ${escapeHtml(label)}</option>
    `).join('');
  }

  function displayOptions(value) {
    return Object.entries(displayLabels).map(([key, label]) => `
      <option value="${key}" ${key === value ? 'selected' : ''}>${key} · ${escapeHtml(label)}</option>
    `).join('');
  }

  function advanceOptions(value) {
    return Object.entries(advanceLabels).map(([key, label]) => `
      <option value="${key}" ${key === value ? 'selected' : ''}>${key} · ${escapeHtml(label)}</option>
    `).join('');
  }

  return { updateCatalog, getSelectedTemplateId };
}

function fieldLabel(technical, friendly, hint = '') {
  return `<span class="journey-admin-field-label"><strong>${escapeHtml(friendly)}</strong> <code>${escapeHtml(technical)}</code>${hint ? `<small class="muted">${escapeHtml(hint)}</small>` : ''}</span>`;
}

function metaRow(field, value) {
  return `<div><dt><code>${escapeHtml(field)}</code></dt><dd>${escapeHtml(value)}</dd></div>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
}
