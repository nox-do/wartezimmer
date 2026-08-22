import assert from 'node:assert/strict';
import test from 'node:test';
import { isFormPdfDisplay } from './form-pdf-display.js';

function validDisplay(overrides: Record<string, unknown> = {}): unknown {
  return {
    title: 'Anamnese',
    subtitle: 'Formular · Patientenportal',
    meta: [{ label: 'Wartenummer', value: 'A-001' }],
    sections: [
      {
        title: 'Patient',
        fields: [{ label: 'Name', value: 'Müller' }],
      },
    ],
    ...overrides,
  };
}

test('isFormPdfDisplay accepts a complete valid payload', () => {
  assert.equal(isFormPdfDisplay(validDisplay()), true);
});

test('isFormPdfDisplay accepts title with empty sections and omitted optionals', () => {
  assert.equal(isFormPdfDisplay({ title: 'Anamnese', sections: [] }), true);
});

test('isFormPdfDisplay accepts empty subtitle, meta, and field values', () => {
  assert.equal(
    isFormPdfDisplay(
      validDisplay({
        subtitle: '',
        meta: [],
        sections: [{ title: '', fields: [{ label: '', value: '' }] }],
      }),
    ),
    true,
  );
});

test('isFormPdfDisplay rejects missing or non-string title', () => {
  assert.equal(isFormPdfDisplay(validDisplay({ title: undefined })), false);
  assert.equal(isFormPdfDisplay(validDisplay({ title: 42 })), false);
  assert.equal(isFormPdfDisplay({ sections: [] }), false);
});

test('isFormPdfDisplay rejects non-string subtitle', () => {
  assert.equal(isFormPdfDisplay(validDisplay({ subtitle: 42 })), false);
  assert.equal(isFormPdfDisplay(validDisplay({ subtitle: null })), false);
});

test('isFormPdfDisplay rejects invalid meta entries', () => {
  assert.equal(isFormPdfDisplay(validDisplay({ meta: 42 })), false);
  assert.equal(isFormPdfDisplay(validDisplay({ meta: null })), false);
  assert.equal(
    isFormPdfDisplay(validDisplay({ meta: [{ label: 'Wartenummer', value: 42 }] })),
    false,
  );
  assert.equal(isFormPdfDisplay(validDisplay({ meta: [{ label: 1, value: 'A-001' }] })), false);
  assert.equal(isFormPdfDisplay(validDisplay({ meta: [null] })), false);
});

test('isFormPdfDisplay rejects missing or invalid sections', () => {
  assert.equal(isFormPdfDisplay(validDisplay({ sections: undefined })), false);
  assert.equal(isFormPdfDisplay(validDisplay({ sections: 42 })), false);
  assert.equal(isFormPdfDisplay(validDisplay({ sections: [{ fields: [] }] })), false);
  assert.equal(isFormPdfDisplay(validDisplay({ sections: [{ title: 42, fields: [] }] })), false);
  assert.equal(
    isFormPdfDisplay(validDisplay({ sections: [{ title: 'Patient', fields: null }] })),
    false,
  );
});

test('isFormPdfDisplay rejects invalid fields', () => {
  assert.equal(
    isFormPdfDisplay(
      validDisplay({ sections: [{ title: 'Patient', fields: [{ label: 'Name', value: 42 }] }] }),
    ),
    false,
  );
  assert.equal(
    isFormPdfDisplay(
      validDisplay({ sections: [{ title: 'Patient', fields: [{ label: 1, value: 'Müller' }] }] }),
    ),
    false,
  );
  assert.equal(
    isFormPdfDisplay(validDisplay({ sections: [{ title: 'Patient', fields: [null] }] })),
    false,
  );
});

test('isFormPdfDisplay rejects non-objects', () => {
  assert.equal(isFormPdfDisplay(null), false);
  assert.equal(isFormPdfDisplay(undefined), false);
  assert.equal(isFormPdfDisplay('Anamnese'), false);
  assert.equal(isFormPdfDisplay(42), false);
  assert.equal(isFormPdfDisplay([]), false);
});
