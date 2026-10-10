// Path and confirmation tokens (6.5, D-29): opaque, random, single-use and short-lived (TOKEN_TTL_MS).
// Only the main process mints them and resolves them into grants; the renderer only ever holds the string.
import { TOKEN_PREFIX, TOKEN_TTL_MS, type Grant, type TokenKind } from '@ayar/protocol';

type Entry = { grant: Grant; expiresAt: number };

export interface TokenRegistryOptions {
  randomBytes: (n: number) => Uint8Array;
  /** Monotonic milliseconds. */
  now: () => number;
}

export class TokenRegistry {
  readonly #o: TokenRegistryOptions;
  readonly #entries = new Map<string, Entry>();

  constructor(o: TokenRegistryOptions) {
    this.#o = o;
  }

  issue(grant: Grant): string {
    this.prune();
    const token = `${TOKEN_PREFIX[grant.kind]}_${Buffer.from(this.#o.randomBytes(32)).toString('base64url')}`;
    this.#entries.set(token, { grant, expiresAt: this.#o.now() + TOKEN_TTL_MS[grant.kind] });
    return token;
  }

  /** Returns the grant once. An unknown, expired, already used, or other-kind token gives null. */
  consume(token: unknown, kind: TokenKind): Grant | null {
    if (typeof token !== 'string') return null;
    const entry = this.#entries.get(token);
    if (!entry) return null;
    this.#entries.delete(token); // single use, even when the use fails below
    if (entry.grant.kind !== kind || this.#o.now() > entry.expiresAt) return null;
    return entry.grant;
  }

  prune(): void {
    const now = this.#o.now();
    for (const [t, e] of this.#entries) if (now > e.expiresAt) this.#entries.delete(t);
  }

  get size(): number {
    return this.#entries.size;
  }
}
