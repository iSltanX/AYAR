import { performance } from 'node:perf_hooks';
import type { Clock } from '../ports/index.ts';

export const systemClock: Clock = {
  now: () => new Date(),
  monotonicMs: () => performance.now(),
};
