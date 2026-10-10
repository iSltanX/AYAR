// Internal ids (14.2: never shown to the user): a kind prefix and 16 random bytes in base64url.
import type { Random } from '../ports/index.ts';

export function newId(random: Random, prefix: string): string {
  return `${prefix}_${Buffer.from(random.bytes(16)).toString('base64url')}`;
}
