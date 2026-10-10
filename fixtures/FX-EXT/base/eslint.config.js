import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist', 'coverage', 'node_modules', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  { rules: { 'no-console': 'error' } },
  { files: ['e2e/**/*.ts', 'src/**/*.test.ts'], rules: { 'no-console': 'off' } },
);
