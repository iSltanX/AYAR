import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(...tseslint.configs.recommendedTypeChecked, {
  languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
}, { files: ['eslint.config.js'], ...tseslint.configs.disableTypeChecked });
