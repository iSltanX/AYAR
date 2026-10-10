// The first module the main process evaluates. D-52: before anything else, refuse Chromium's remote debugging
// switches unless the Node inspector is active (which only the derived test package allows, D-51): no fuse
// covers that port, and through it a local process could drive the UI. Exit code 78 (EX_CONFIG).
import { app } from 'electron';
import inspector from 'node:inspector';

const DEBUG_SWITCHES = ['remote-debugging-port', 'remote-debugging-pipe', 'remote-debugging-address'];

if (DEBUG_SWITCHES.some((s) => app.commandLine.hasSwitch(s)) && !inspector.url()) {
  process.stderr.write('AYAR: refusing remote debugging switches without the inspector (D-52)\n');
  app.exit(78);
} else {
  // Top-level await: Electron waits for the entry module before 'ready', so app.ts registers its scheme in time.
  await import('./app.ts');
}
