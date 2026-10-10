// The engine's ports on Node (utilityProcess or child process).
import type { EnginePorts } from '../ports/index.ts';
import { systemClock } from './clock.ts';
import { nodeFileSystem } from './fs.ts';
import { nodeNetwork, type NetworkOptions } from './network.ts';
import { nodeProcessControl } from './processes.ts';
import { nodeRandom } from './random.ts';

export const nodePorts: EnginePorts = {
  fs: nodeFileSystem,
  clock: systemClock,
  processes: nodeProcessControl,
  random: nodeRandom,
  network: nodeNetwork(),
  exit: (code) => process.exit(code),
};

/** The same ports with the host's test options (tools/cli only: never the app's utilityProcess entry). */
export function nodePortsWith(o: { network?: NetworkOptions }): EnginePorts {
  return { ...nodePorts, network: nodeNetwork(o.network ?? {}) };
}
