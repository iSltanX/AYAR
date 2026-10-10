// engine.health: the engine reports its own state after boot; the supervisor in the main process (C-01)
// reports restarts and the failed state with the log path (C-01: "شاشة خطأ فيها مسار السجل").
import { ErrorCode } from '../errors.ts';
import { z } from '../zod.ts';
import { defineEvent } from './define.ts';

/** degraded: the engine runs but its database is unusable (corrupt, or newer than this app). */
export const EngineState = z.enum(['starting', 'ready', 'degraded', 'restarting', 'failed', 'stopped']);
export type EngineState = z.infer<typeof EngineState>;

export const HmacKeySource = z.enum(['file', 'test']);
export type HmacKeySource = z.infer<typeof HmacKeySource>;

export const EngineHealth = z.strictObject({
  source: z.enum(['engine', 'supervisor']),
  state: EngineState,
  reason: ErrorCode.nullable(),
  /** Supervisor: the restart attempt this state belongs to (1..3). */
  attempt: z.int().nonnegative().nullable(),
  retryInMs: z.int().nonnegative().nullable(),
  logPath: z.string().nullable(),
  schemaVersion: z.int().nonnegative().nullable(),
  /** test: the declared test key of tools/cli (G-47); never in the app. */
  hmacKeySource: HmacKeySource.nullable(),
});
export type EngineHealth = z.infer<typeof EngineHealth>;

export const engineEvents = {
  'engine.health': defineEvent({ owner: 'C-04', payload: EngineHealth, since: '1.0', implementedIn: 'DEV-3' }),
};
