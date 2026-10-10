// Shape of a command definition. Each domain file declares its commands with defineCommand; index.ts merges
// them. A result schema of z.unknown() means the domain phase has not defined the contract yet (6.5: domain
// contracts are added in their phases with a minor version).
import type { ComponentId, PhaseId } from '../common.ts';
import type { GrantRequirement } from '../tokens.ts';
import type { z } from '../zod.ts';

/** renderer: callable through window.ayar.invoke. host: only the main process or tools/cli may send it. */
export type Audience = 'renderer' | 'host';
/** Who executes it: the engine, or the main process itself (system dialogs, clipboard, supervisor). */
export type Handler = 'engine' | 'main';

export interface CommandDefinition<P extends z.ZodType = z.ZodType, R extends z.ZodType = z.ZodType> {
  /** Owning component (G-19). */
  readonly owner: ComponentId;
  readonly handler: Handler;
  readonly audience: Audience;
  readonly payload: P;
  /** What the handler returns. */
  readonly result: R;
  /** What the renderer receives, when the main process adds to the result (a confirmation token). */
  readonly rendererResult?: z.ZodType;
  readonly grants: readonly GrantRequirement[];
  /** A preview command: the main process mints a confirmation token for this command from its result. */
  readonly confirms?: string;
  /** Protocol version that introduced it, and the phase that implements its handler. */
  readonly since: `${number}.${number}`;
  readonly implementedIn: PhaseId;
}

export function defineCommand<P extends z.ZodType, R extends z.ZodType>(
  def: Omit<CommandDefinition<P, R>, 'grants'> & { grants?: readonly GrantRequirement[] },
): CommandDefinition<P, R> {
  return { ...def, grants: def.grants ?? [] };
}
