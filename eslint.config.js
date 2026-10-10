// AYAR lint configuration (DEV-3). Type-aware typescript-eslint plus Svelte, and the architecture rules:
//   1. packages/** never import electron (D-19, NFR-07, AT-30). Proven by packages/engine/test/no-electron-rule.test.ts.
//   2. packages/protocol and packages/i18n are Node-free, because the renderer imports them (E-13, lesson 5).
//   3. The renderer imports neither electron nor Node.
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import svelteConfig from './apps/desktop/svelte.config.js';

const ELECTRON_PATHS = [
  { name: 'electron', message: 'The engine and its sibling packages never import electron (D-19, NFR-07). Use the abstract ports in packages/engine/src/ports.' },
];
const ELECTRON_PATTERNS = [
  { group: ['electron/*', '@electron/*'], message: 'The engine and its sibling packages never import electron (D-19, NFR-07).' },
];
const NODE_PATTERNS = [
  { group: ['node:*'], message: 'This package is Node-free: the renderer imports it.' },
];
// Static imports are covered by no-restricted-imports; these catch require() and import() too.
const ELECTRON_SYNTAX = [
  {
    selector: "CallExpression[callee.name='require'][arguments.0.value=/^(electron|@electron\\u002F)/]",
    message: 'The engine and its sibling packages never require electron (D-19, NFR-07).',
  },
  {
    selector: 'ImportExpression[source.value=/^(electron|@electron\\u002F)/]',
    message: 'The engine and its sibling packages never import electron (D-19, NFR-07).',
  },
];

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/.svelte-check/**',
      'spikes/**',
      'fixtures/**',
      'docs/**',
      'tools/dashboard/**',
      'tools/waves/**',
    ],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname, extraFileExtensions: ['.svelte'] },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
    },
  },
  ...svelte.configs.recommended,
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser, projectService: true, extraFileExtensions: ['.svelte'], svelteConfig },
    },
  },
  // 1. No electron anywhere under packages/.
  {
    files: ['packages/**/*.ts', 'packages/**/*.js', 'packages/**/*.mjs', 'packages/**/*.cjs'],
    rules: {
      'no-restricted-imports': ['error', { paths: ELECTRON_PATHS, patterns: ELECTRON_PATTERNS }],
      'no-restricted-syntax': ['error', ...ELECTRON_SYNTAX],
    },
  },
  // 2. Node-free packages (their sources; tests may use Node).
  {
    files: ['packages/protocol/src/**/*.ts', 'packages/i18n/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: ELECTRON_PATHS, patterns: [...ELECTRON_PATTERNS, ...NODE_PATTERNS] }],
    },
  },
  // 3. The renderer: neither electron nor Node.
  {
    files: ['apps/desktop/src/renderer/**/*.ts', 'apps/desktop/src/renderer/**/*.svelte'],
    rules: {
      'no-restricted-imports': ['error', { paths: ELECTRON_PATHS, patterns: [...ELECTRON_PATTERNS, ...NODE_PATTERNS] }],
      'no-restricted-syntax': ['error', ...ELECTRON_SYNTAX],
    },
  },
  // Svelte 5: `let { ... }: Props = $props()` is the documented form, and $props() is typed any (E-13).
  { files: ['**/*.svelte'], rules: { '@typescript-eslint/no-unsafe-assignment': 'off' } },
  { files: ['**/*.js', '**/*.cjs', '**/*.mjs', '**/*.config.ts'], ...tseslint.configs.disableTypeChecked },
);
