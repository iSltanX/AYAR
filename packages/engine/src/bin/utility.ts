// Entry point under Electron's utilityProcess (bundled to apps/desktop/dist/engine/engine.mjs). It imports no
// electron: the channel is the `process.parentPort` global.
import { installCrashHandlers } from '../host/crash.ts';
import { startEngine } from '../host/engine.ts';
import { utilityProcessChannel } from '../node/channels.ts';
import { nodePorts } from '../node/ports.ts';

installCrashHandlers(startEngine({ ports: nodePorts, channel: utilityProcessChannel() }));
