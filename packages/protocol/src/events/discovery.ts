// Discovery events (C-06). The DiscoverySnapshot contract arrives with DEV-4 (minor version).
import { Id } from '../common.ts';
import { z } from '../zod.ts';
import { defineEvent } from './define.ts';

export const discoveryEvents = {
  'discovery.progress': defineEvent({
    owner: 'C-06',
    payload: z.looseObject({ projectId: Id, filesSeen: z.int().nonnegative() }),
    since: '1.0',
    implementedIn: 'DEV-4',
  }),
  'discovery.done': defineEvent({
    owner: 'C-06',
    payload: z.looseObject({ projectId: Id, snapshotId: Id, partial: z.boolean() }),
    since: '1.0',
    implementedIn: 'DEV-4',
  }),
};
