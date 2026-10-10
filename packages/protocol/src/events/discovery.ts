// Discovery events (C-06, protocol 1.1): progress every 200 ms, then done, cancelled (nothing saved) or failed.
import { Id } from '../common.ts';
import { DiscoverySummary } from '../domain/discovery.ts';
import { ProtocolError } from '../errors.ts';
import { z } from '../zod.ts';
import { defineEvent } from './define.ts';

export const discoveryEvents = {
  'discovery.progress': defineEvent({
    owner: 'C-06',
    payload: z.looseObject({
      projectId: Id,
      filesSeen: z.int().nonnegative(),
      discoveryId: Id,
      dirsSeen: z.int().nonnegative(),
      /** The folder being read, relative to the project root (9.2 «المجلد الحالي»). */
      currentDir: z.string(),
      /** Ecosystems recognized so far (9.2 «الأنواع المكتشفة حتى الآن»). */
      kinds: z.array(z.string()),
    }),
    since: '1.0',
    implementedIn: 'DEV-4',
  }),
  'discovery.done': defineEvent({
    owner: 'C-06',
    payload: z.looseObject({ projectId: Id, snapshotId: Id, partial: z.boolean(), discoveryId: Id, summary: DiscoverySummary }),
    since: '1.0',
    implementedIn: 'DEV-4',
  }),
  'discovery.cancelled': defineEvent({
    owner: 'C-06',
    payload: z.strictObject({ projectId: Id, discoveryId: Id }),
    since: '1.1',
    implementedIn: 'DEV-4',
  }),
  'discovery.failed': defineEvent({
    owner: 'C-06',
    payload: z.strictObject({ projectId: Id, discoveryId: Id, error: ProtocolError }),
    since: '1.1',
    implementedIn: 'DEV-4',
  }),
};
