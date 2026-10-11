// The web probe's captures and reference images (C-14, C-17; protocol 1.4, DEV-7): what a run captured, how each
// capture compares with the approved reference of its key, the states that were not captured and why (G-29), and
// the references a project has. The gallery and the reference board that show them are DEV-12's.
import { Id } from '../common.ts';
import { BaselineView, CaptureView, UncapturedView } from '../domain/probe.ts';
import { z } from '../zod.ts';
import { defineCommand } from './define.ts';

const base = { owner: 'C-14', handler: 'engine', audience: 'renderer', since: '1.4', implementedIn: 'DEV-7' } as const;

export const probeCommands = {
  'captures.list': defineCommand({
    ...base,
    payload: z.strictObject({ checkRunId: Id }),
    result: z.strictObject({ captures: z.array(CaptureView), uncaptured: z.array(UncapturedView) }),
  }),
  'baselines.list': defineCommand({ ...base, payload: z.strictObject({ projectId: Id }), result: z.strictObject({ baselines: z.array(BaselineView) }) }),
};
