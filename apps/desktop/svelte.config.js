// Svelte 5 for the renderer. No preprocessors: TypeScript in <script lang="ts"> is native in Svelte 5.
export default {
  compilerOptions: {
    // The CSP forbids inline styles (15.2): component styles are emitted as CSS files, never injected.
    css: 'external',
  },
};
