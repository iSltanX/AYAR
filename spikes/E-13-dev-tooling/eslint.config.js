import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import svelteConfig from './apps/desktop/svelte.config.js';

export default defineConfig(
  { ignores: ['**/node_modules/**', 'results/**', '**/negative/**', 'negative-lint/**', 'negative-svelte/**', '**/.svelte-check/**'] },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname, extraFileExtensions: ['.svelte'] },
    },
  },
  ...svelte.configs.recommended,
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: tseslint.parser, projectService: true, extraFileExtensions: ['.svelte'], svelteConfig } },
  },
  // Svelte 5: `let { ... }: Props = $props()` is the documented form, and $props() is typed any.
  { files: ['**/*.svelte'], rules: { '@typescript-eslint/no-unsafe-assignment': 'off' } },
  // node:test: describe() and it() return promises that the runner awaits itself.
  { files: ['**/*.node.test.ts'], rules: { '@typescript-eslint/no-floating-promises': 'off' } },
  { files: ['**/*.js', '*.config.ts', 'apps/desktop/vite.config.ts'], ...tseslint.configs.disableTypeChecked },
);
