/** @type {import('stylelint').Config} */
module.exports = {
  extends: ['stylelint-config-recommended'],
  ignoreFiles: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    'ui/.svelte-kit/**',
    'ui/build/**',
  ],
  rules: {
    // Global sheets intentionally share broad element/attribute selectors.
    'no-descending-specificity': null,
    // Existing sheets still use a few legacy values; unused CSS is
    // covered by scripts/check-unused-css.mjs (PurgeCSS).
    'declaration-property-value-keyword-no-deprecated': null,
    'property-no-deprecated': null,
    'selector-pseudo-class-no-unknown': [
      true,
      {
        ignorePseudoClasses: ['global'],
      },
    ],
  },
};
