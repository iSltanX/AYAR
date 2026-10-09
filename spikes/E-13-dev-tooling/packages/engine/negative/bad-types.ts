import { sectionVerdict } from '../src/verdict.ts';
// Deliberate type error: 'green' is not an Outcome.
export const v = sectionVerdict([{ id: 'x', outcome: 'green', required: true }]);
