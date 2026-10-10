// The worker thread's entry when the engine runs from its sources and was given no entry of its own (the services
// of the engine's tests). The app and tools/cli pass their entry module instead (bin/utility.ts, bin/node.ts).
import { runVerdictWorker } from './thread.ts';

runVerdictWorker();
