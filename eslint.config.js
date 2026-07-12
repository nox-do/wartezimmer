const js = require('@eslint/js');
const globals = require('globals');
const sveltePlugin = require('eslint-plugin-svelte');
const svelteParser = require('svelte-eslint-parser');
const tseslint = require('typescript-eslint');

const tsUnusedVars = [
  'error',
  {
    argsIgnorePattern: '^_',
    varsIgnorePattern: '^_',
    caughtErrorsIgnorePattern: '^_',
  },
];

module.exports = tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'ui/build/**',
      'ui/.svelte-kit/**',
      'ui/src/lib/ops/generated/**',
      'manager/out/**',
      'packages/flow-core/src/public/**',
      'packages/flow-core/canvases/**',
      'docs/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...sveltePlugin.configs['flat/recommended'],
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': tsUnusedVars,
      'prefer-const': 'error',
    },
  },
  {
    files: ['**/*.svelte.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': tsUnusedVars,
      'svelte/prefer-svelte-reactivity': 'error',
    },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.svelte'],
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'svelte/no-navigation-without-resolve': 'error',
      'svelte/no-useless-children-snippet': 'error',
      'svelte/require-each-key': 'error',
      'svelte/no-dom-manipulating': 'error',
      'svelte/no-unused-svelte-ignore': 'error',
    },
  },
);
