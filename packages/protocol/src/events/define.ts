import type { ComponentId, PhaseId } from '../common.ts';
import type { z } from '../zod.ts';

export interface EventDefinition<P extends z.ZodType = z.ZodType> {
  readonly owner: ComponentId;
  readonly payload: P;
  readonly since: `${number}.${number}`;
  readonly implementedIn: PhaseId;
}

export function defineEvent<P extends z.ZodType>(def: EventDefinition<P>): EventDefinition<P> {
  return def;
}
