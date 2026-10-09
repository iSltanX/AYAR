import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  test: { name: 'desktop', include: ['test/**/*.test.ts'], environment: 'node' },
});
