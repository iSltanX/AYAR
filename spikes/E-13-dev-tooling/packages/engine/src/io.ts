import { readFileSync } from 'node:fs';
import type { CheckResult } from './verdict.ts';

export function readResults(file: string): CheckResult[] {
  return JSON.parse(readFileSync(file, 'utf8')) as CheckResult[];
}
