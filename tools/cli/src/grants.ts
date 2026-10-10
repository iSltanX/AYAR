// tools/cli is the host (D-19): it attaches the grants the main process would attach after a system dialog. A
// token here is only a well-formed placeholder; the engine trusts the grant, exactly as it trusts the main process.
import { randomBytes } from 'node:crypto';
import { TOKEN_PREFIX, type Grants, type TokenKind } from '@ayar/protocol';

export function placeholderToken(kind: TokenKind): string {
  return `${TOKEN_PREFIX[kind]}_${randomBytes(32).toString('base64url')}`;
}

/** A selection (or source, or destination) token for a path, with the grant that resolves it. */
export function pathGrant(kind: 'selection' | 'source' | 'destination', path: string): { token: string; grants: Grants } {
  const field = kind === 'selection' ? 'selectionToken' : kind === 'source' ? 'sourceToken' : 'destinationToken';
  return { token: placeholderToken(kind), grants: { [field]: { kind, path } } };
}

/**
 * A confirmation token bound to a command and its target, as confirm.issue would mint it — or, with the digest of
 * a preview (setup.preview, tools.preview), as the main process mints it for exactly what was shown.
 */
export function confirmationGrant(command: string, target: string, digest: string | null = null): { token: string; grants: Grants } {
  return { token: placeholderToken('confirmation'), grants: { confirmationToken: { kind: 'confirmation', command, target, digest } } };
}
