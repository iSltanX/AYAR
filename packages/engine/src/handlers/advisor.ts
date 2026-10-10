// advisor.suggest, task.create and tasks.list (C-20, FR-46, FR-45, FR-18). The advisor reads the project's last
// discovery (ecosystems, migration folders), never the files themselves, and runs nothing.
import type { CommandPayload } from '@ayar/protocol';
import { AdvisorInputError, suggest } from '../advisor/advisor.ts';
import { advisorFactsFromSnapshot, cardContextFromSnapshot } from '../advisor/facts.ts';
import type { HandlerContext } from '../host/dispatcher.ts';
import type { CommandHandler } from '../host/dispatcher.ts';
import { CommandError } from '../host/errors.ts';
import { CardSourceError } from '../tasks/cards.ts';

function knownProject(ctx: HandlerContext, projectId: string): void {
  if (!ctx.db.get('SELECT id FROM projects WHERE id = ?', projectId)) throw new CommandError('not_found', { reason: 'project' });
}

export const advisorSuggest: CommandHandler = (payload, ctx) => {
  const { projectId, context } = payload as CommandPayload<'advisor.suggest'>;
  knownProject(ctx, projectId);
  try {
    return suggest(context, ctx.catalog.kb, advisorFactsFromSnapshot(ctx.services.projects.snapshot(projectId)));
  } catch (e) {
    // The dispatcher validated the payload already; this keeps the advisor's own check a coded answer too.
    if (e instanceof AdvisorInputError) throw new CommandError('invalid_payload', { path: e.issues[0]?.path ?? '' });
    throw e;
  }
};

export const taskCreate: CommandHandler = (payload, ctx) => {
  const { projectId, source } = payload as CommandPayload<'task.create'>;
  knownProject(ctx, projectId);
  const snapshot = ctx.services.projects.snapshot(projectId);
  try {
    return { task: ctx.services.tasks.create(projectId, source, advisorFactsFromSnapshot(snapshot), cardContextFromSnapshot(snapshot)) };
  } catch (e) {
    // The project exists; the source is what is wrong (review m6).
    if (e instanceof CardSourceError) throw new CommandError('invalid_payload', { path: 'source', reason: e.reason });
    throw e;
  }
};

export const tasksList: CommandHandler = (payload, ctx) => {
  const { projectId } = payload as CommandPayload<'tasks.list'>;
  knownProject(ctx, projectId);
  return { tasks: ctx.services.tasks.list(projectId) };
};
