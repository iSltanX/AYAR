import { defineConfig } from 'vite';

// يبني الإضافة إلى dist/ لتُحمَّل في Chromium. manifest.json والأيقونات و_locales تُنسخ من public/.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: 'popup.html',
        options: 'options.html',
        background: 'src/background.ts',
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
});
