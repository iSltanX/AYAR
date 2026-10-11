// review.record and reviews.list (C-16, FR-34, D-35; DEV-9).
import type { CommandPayload } from '@ayar/protocol';
import type { CommandHandler } from '../host/dispatcher.ts';
import { latestProfile } from '../profile/store.ts';

export const reviewRecord: CommandHandler = async (payload, ctx) => {
  const { target, decision, note } = payload as CommandPayload<'review.record'>;
  const recorded = await ctx.services.reviews.record(target, decision, note);
  // DEV-12 (AT-46): integ.reviews applies once the project has a review (the profile's `state.reviews`). The first
  // review proposes the profile again from the last discovery, so the next round runs it and counts what expires.
  const projectId = recorded.review.projectId;
  const reviewsCheck = latestProfile(ctx.db, projectId)?.content.checks.find((c) => c.checkId === 'integ.reviews');
  if (reviewsCheck && !reviewsCheck.applicable) ctx.services.profiles.propose(projectId);
  return recorded;
};

export const reviewsList: CommandHandler = async (payload, ctx) => ({ reviews: await ctx.services.reviews.list((payload as CommandPayload<'reviews.list'>).projectId) });
