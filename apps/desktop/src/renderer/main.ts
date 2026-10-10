// Renderer entry: mounts the empty root under the CSP and creates the typed bridge client.
import { mount } from 'svelte';
import App from './App.svelte';
import { createBridgeClient } from './bridge.ts';

export const ayar = createBridgeClient(window.ayar);

const target = document.getElementById('app');
if (!target) throw new Error('mount point #app is missing');
mount(App, { target });
