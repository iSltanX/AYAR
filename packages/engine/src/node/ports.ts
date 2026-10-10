// The engine's ports on Node (utilityProcess or child process).
import type { EnginePorts } from '../ports/index.ts';
import { systemClock } from './clock.ts';
import { nodeFileSystem } from './fs.ts';
import { nodeProcessControl } from './processes.ts';
import { nodeRandom } from './random.ts';

export const nodePorts: EnginePorts = {
  fs: nodeFileSystem,
  clock: systemClock,
  processes: nodeProcessControl,
  random: nodeRandom,
  exit: (code) => process.exit(code),
};
