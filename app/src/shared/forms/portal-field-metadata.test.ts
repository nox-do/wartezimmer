import assert from 'node:assert/strict';
import test from 'node:test';
import { FORM_PORTAL_CONTROLS, toPortalFormFields } from './portal-field-metadata.js';
import { FORM_TEMPLATE_DEFINITIONS } from './templates/definitions/index.js';
import { toPortalFormTemplate } from './template-registry.js';

const PORTAL_CONTROL_SET = new Set<string>(FORM_PORTAL_CONTROLS);

test('every delivered template field has a valid portalControl', () => {
  for (const template of FORM_TEMPLATE_DEFINITIONS) {
    const delivered = toPortalFormTemplate(template);
    assert.ok(delivered.fields.length > 0, `${template.id} has fields`);
    for (const field of delivered.fields) {
      assert.equal(
        PORTAL_CONTROL_SET.has(field.portalControl),
        true,
        `${template.id}.${field.id} has portalControl ${String(field.portalControl)}`,
      );
    }
  }
});

test('templates without an explicit map still receive inferred portalControl', () => {
  const fields = toPortalFormFields('future-questionnaire', [
    { id: 'flag', label: 'Flag', type: 'boolean', required: true },
    { id: 'when', label: 'When', type: 'date', required: false },
    { id: 'count', label: 'Count', type: 'number', required: false },
    { id: 'short', label: 'Short', type: 'text', required: false, maxLength: 80 },
    { id: 'medium', label: 'Medium', type: 'text', required: false, maxLength: 400 },
    { id: 'long', label: 'Long', type: 'text', required: false, maxLength: 900 },
  ]);
  assert.deepEqual(
    fields.map((field) => field.portalControl),
    ['checkbox', 'compact', 'compact', 'input', 'textarea-short', 'textarea'],
  );
});
