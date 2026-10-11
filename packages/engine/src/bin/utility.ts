// Entry point under Electron's utilityProcess (bundled to apps/desktop/dist/engine/engine.mjs). It imports no
// electron: the channel is the `process.parentPort` global. The same module is the entry of the verdict's worker
// threads (C-13), told apart by their workerData, so the bundle needs no file of its own.
import { installCrashHandlers } from '../host/crash.ts';
import { startEngine } from '../host/engine.ts';
import { fileURLToPath } from 'node:url';
import { utilityProbeHost, utilityProcessChannel } from '../node/channels.ts';
import { nodePorts } from '../node/ports.ts';
import { isVerdictWorker, runVerdictWorker } from '../verdict/thread.ts';

// C-14 (E-11): the probe is a second utilityProcess the main process starts on request; axe-core is shipped beside
// the engine's bundle (dist/engine/axe.min.js).
if (isVerdictWorker()) runVerdictWorker();
else installCrashHandlers(startEngine({ ports: { ...nodePorts, probe: utilityProbeHost(fileURLToPath(new URL('./axe.min.js', import.meta.url))) }, channel: utilityProcessChannel(), workerEntry: import.meta.url }));
