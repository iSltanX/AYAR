// Entry point under Electron's utilityProcess (bundled to apps/desktop/dist/engine/engine.mjs). It imports no
// electron: the channel is the `process.parentPort` global. The same module is the entry of the verdict's worker
// threads (C-13), told apart by their workerData, so the bundle needs no file of its own.
import { installCrashHandlers } from '../host/crash.ts';
import { startEngine } from '../host/engine.ts';
import { utilityProcessChannel } from '../node/channels.ts';
import { nodePorts } from '../node/ports.ts';
import { isVerdictWorker, runVerdictWorker } from '../verdict/thread.ts';

if (isVerdictWorker()) runVerdictWorker();
else installCrashHandlers(startEngine({ ports: nodePorts, channel: utilityProcessChannel(), workerEntry: import.meta.url }));
