// The probe as a Node child process started with fork() (tools/cli, the engine's tests; G-47): its channel is
// Node's IPC. It ends when its parent goes.
import { startProbe } from '../driver/index.ts';

if (typeof process.send !== 'function') throw new Error('the probe must be started with fork()');
process.once('disconnect', () => process.exit(0));
startProbe({ send: (m) => process.send?.(m), onMessage: (l) => process.on('message', (m) => l(m)) });
