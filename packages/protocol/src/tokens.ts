// Path and confirmation tokens (6.5, D-29). The main process mints them after a system dialog or after the
// user saw a preview; the UI only ever holds the opaque token. When the main process forwards a command to
// the engine it resolves each token into a grant, so the engine sees what the token stands for.
import { AbsolutePath } from './common.ts';
import { z } from './zod.ts';

export const TOKEN_KINDS = ['selection', 'destination', 'source', 'confirmation'] as const;
export type TokenKind = (typeof TOKEN_KINDS)[number];

export const TOKEN_PREFIX: Record<TokenKind, string> = {
  selection: 'sel',
  destination: 'dst',
  source: 'src',
  confirmation: 'cfm',
};

/** 32 random bytes, base64url, after a kind prefix. */
const tokenOf = (kind: TokenKind) =>
  z.string().regex(new RegExp(`^${TOKEN_PREFIX[kind]}_[A-Za-z0-9_-]{43}$`), `invalid ${kind} token`);

export const SelectionToken = tokenOf('selection');
export const DestinationToken = tokenOf('destination');
export const SourceToken = tokenOf('source');
export const ConfirmationToken = tokenOf('confirmation');

/** Lifetimes [D-DEV3-05]: confirmations are short and single-use; path tokens are single-use too. */
export const TOKEN_TTL_MS: Record<TokenKind, number> = {
  selection: 5 * 60_000,
  destination: 5 * 60_000,
  source: 5 * 60_000,
  confirmation: 2 * 60_000,
};

export const Grant = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('selection'), path: AbsolutePath }),
  z.strictObject({ kind: z.literal('destination'), path: AbsolutePath }),
  z.strictObject({ kind: z.literal('source'), path: AbsolutePath }),
  z.strictObject({
    kind: z.literal('confirmation'),
    command: z.string(),
    target: z.string(),
    digest: z.string().nullable(),
  }),
]);
export type Grant = z.infer<typeof Grant>;

export const Grants = z.record(z.string(), Grant);
export type Grants = z.infer<typeof Grants>;

/** What a command needs before it may run. `targetField` binds a confirmation to one payload field. */
export type GrantRequirement =
  | { readonly field: 'selectionToken'; readonly kind: 'selection' }
  | { readonly field: 'destinationToken'; readonly kind: 'destination' }
  | { readonly field: 'sourceToken'; readonly kind: 'source' }
  | { readonly field: 'confirmationToken'; readonly kind: 'confirmation'; readonly targetField: string | null };

/** The confirmation target when a command has no target field (`data.purge`). */
export const GLOBAL_TARGET = '*';
