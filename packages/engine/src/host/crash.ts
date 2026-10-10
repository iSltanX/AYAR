// C-04: an unhandled exception is logged, then the engine ends on purpose and the supervisor restarts it.
// Continuing in an unknown state is more dangerous than stopping.
import type { EngineHandle } from './engine.ts';

export function installCrashHandlers(engine: EngineHandle): void {
  process.on('uncaughtException', (e) => engine.crash(e));
  process.on('unhandledRejection', (e) => engine.crash(e));
  // SIGTERM from the supervisor (C-01): close the database and leave; SIGKILL follows after 2 s otherwise.
  process.on('SIGTERM', () => engine.stop(0));
}
