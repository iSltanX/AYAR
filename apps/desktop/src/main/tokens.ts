// Path and confirmation tokens (6.5, D-29): opaque, random, single-use and short-lived (TOKEN_TTL_MS).
// Only the main process mints them and resolves them into grants; the renderer only ever holds the string.
// A path token is also bound to the purpose of its dialog (the command that may redeem it).
import { TOKEN_PREFIX, TOKEN_TTL_MS, type Grant, type TokenKind } from '@ayar/protocol';

/** Wall clock and monotonic clock, in milliseconds: a token expires when either says so. */
export interface TokenClock {
  wall(): number;
  mono(): number;
}

type Entry = { grant: Grant; purpose: string | null; wallAt: number; monoAt: number; ttl: number };

export interface TokenRegistryOptions {
  randomBytes: (n: number) => Uint8Array;
  clock: TokenClock;
  /** Live tokens kept at most; the oldest is dropped beyond it (a looping renderer cannot grow it). */
  maxEntries?: number;
}

export class TokenRegistry {
  readonly #o: Required<TokenRegistryOptions>;
  readonly #entries = new Map<string, Entry>();

  constructor(o: TokenRegistryOptions) {
    this.#o = { maxEntries: 256, ...o };
  }

  issue(grant: Grant, purpose: string | null = null): string {
    this.prune();
    while (this.#entries.size >= this.#o.maxEntries) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) break;
      this.#entries.delete(oldest);
    }
    const token = `${TOKEN_PREFIX[grant.kind]}_${Buffer.from(this.#o.randomBytes(32)).toString('base64url')}`;
    this.#entries.set(token, { grant, purpose, wallAt: this.#o.clock.wall(), monoAt: this.#o.clock.mono(), ttl: TOKEN_TTL_MS[grant.kind] });
    return token;
  }

  /**
   * Returns the grant once. An unknown, expired, already used, other-kind or other-purpose token gives null.
   * The token is spent by any attempt, successful or not.
   */
  consume(token: unknown, kind: TokenKind, purpose: string | null = null): Grant | null {
    if (typeof token !== 'string') return null;
    const entry = this.#entries.get(token);
    if (!entry) return null;
    this.#entries.delete(token);
    if (entry.grant.kind !== kind || this.#expired(entry)) return null;
    if (entry.purpose !== null && entry.purpose !== purpose) return null;
    return entry.grant;
  }

  prune(): void {
    for (const [t, e] of this.#entries) if (this.#expired(e)) this.#entries.delete(t);
  }

  get size(): number {
    return this.#entries.size;
  }

  #expired(e: Entry): boolean {
    const wall = this.#o.clock.wall();
    // The wall clock covers time asleep (the monotonic one stops); the monotonic one covers clock changes.
    return wall < e.wallAt || wall - e.wallAt > e.ttl || this.#o.clock.mono() - e.monoAt > e.ttl;
  }
}
