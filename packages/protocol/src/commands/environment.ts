// C-07: the environment and the toolchain of a project, outside 6.5 [D-DEV4-02]. The UI shows it on the
// approval screen (withheld variables) and in the project configuration (AT-32); readiness (DEV-5) uses it.
import { Id } from '../common.ts';
import { InstanceKey } from '../domain/profile.ts';
import { ChildEnvSummary, ResolvedEnv } from '../domain/environment.ts';
import { z } from '../zod.ts';
import { defineCommand } from './define.ts';

export const environmentCommands = {
  'environment.resolve': defineCommand({
    owner: 'C-07',
    handler: 'engine',
    audience: 'renderer',
    since: '1.1',
    implementedIn: 'DEV-4',
    payload: z.strictObject({
      projectId: Id,
      /** Read the login shell again instead of the session's cached result (C-07 point 1). */
      refresh: z.boolean().optional(),
      /** Run the version probes (5 s each, COREPACK_ENABLE_NETWORK=0): a readiness step, not discovery. */
      probe: z.boolean().optional(),
      /** Also summarize the environment this instance would get. */
      instance: InstanceKey.optional(),
    }),
    result: z.strictObject({ env: ResolvedEnv, child: ChildEnvSummary.nullable() }),
  }),
};
