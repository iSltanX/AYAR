// Renderer entry: the design system (D-DEV10-05: imported now that the screens are built, DEV-11), the app's
// document rules, and the root under the CSP. The bridge client is made on first use (app/client.ts).
import './design/index.css';
import './app/app.css';
import { mount } from 'svelte';
import App from './App.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('mount point #app is missing');
mount(App, { target });
