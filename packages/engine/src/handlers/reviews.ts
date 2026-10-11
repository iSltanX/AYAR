// review.record and reviews.list (C-16, FR-34, D-35; DEV-9).
import type { CommandPayload } from '@ayar/protocol';
import type { CommandHandler } from '../host/dispatcher.ts';

export const reviewRecord: CommandHandler = (payload, ctx) => {
  const { target, decision, note } = payload as CommandPayload<'review.record'>;
  return ctx.services.reviews.record(target, decision, note);
};

export const reviewsList: CommandHandler = async (payload, ctx) => ({ reviews: await ctx.services.reviews.list((payload as CommandPayload<'reviews.list'>).projectId) });
