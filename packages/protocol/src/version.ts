import { z } from './zod.ts';

/**
 * Protocol version (D-29). The major number must match on both sides of a connection; a different major
 * stops the connection with a clear error. Domain phases add contracts with a minor bump.
 */
export const PROTOCOL_VERSION = { major: 1, minor: 5 } as const;

export const ProtocolVersion = z.strictObject({
  major: z.int().nonnegative(),
  minor: z.int().nonnegative(),
});
export type ProtocolVersion = z.infer<typeof ProtocolVersion>;

export function isCompatible(local: ProtocolVersion, remote: ProtocolVersion): boolean {
  return local.major === remote.major;
}

export function formatVersion(v: ProtocolVersion): string {
  return `${v.major}.${v.minor}`;
}
