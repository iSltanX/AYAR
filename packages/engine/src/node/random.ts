import { randomBytes } from 'node:crypto';
import type { Random } from '../ports/index.ts';

export const nodeRandom: Random = {
  bytes: (length) => new Uint8Array(randomBytes(length)),
};
