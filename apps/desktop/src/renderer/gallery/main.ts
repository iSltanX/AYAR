// The component gallery (DEV-10, task 5): a development-only page, built only with AYAR_GALLERY=1 (see
// vite.renderer.config.ts) and never part of the release build. It renders every component with its variants
// in both languages and both themes, under the app's CSP.
import '../design/index.css';
import { mount } from 'svelte';
import Gallery from './Gallery.svelte';

const target = document.getElementById('gallery');
if (!target) throw new Error('gallery mount point is missing');
mount(Gallery, { target });
