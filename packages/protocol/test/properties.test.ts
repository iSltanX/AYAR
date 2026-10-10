// Property tests (plan 19, fast-check): the validators never throw, and never echo input values.
import fc from 'fast-check';
import { describe, it } from 'vitest';
import { COMMAND_NAMES, isCommandName, parseEngineMessage, parseHostMessage } from '../src/index.ts';

describe('protocol properties', () => {
  it('parseHostMessage and parseEngineMessage never throw, whatever arrives', () => {
    fc.assert(
      fc.property(fc.anything(), (raw) => {
        const a = parseHostMessage(raw);
        const b = parseEngineMessage(raw);
        return typeof a.ok === 'boolean' && typeof b.ok === 'boolean';
      }),
      { numRuns: 2000 },
    );
  });

  it('any name outside the registry is refused as unknown_command', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 64 }).filter((s) => !isCommandName(s)), (command) => {
        const r = parseHostMessage({ kind: 'command', id: 1, command, payload: {} });
        return !r.ok && r.error.code === 'unknown_command';
      }),
    );
  });

  it('validation errors never contain the rejected value (it may be a secret or a path)', () => {
    const secret = fc.string({ minLength: 12, maxLength: 40 }).map((s) => `S3CR3T-${s.replace(/[^A-Za-z0-9]/g, 'x')}`);
    fc.assert(
      fc.property(fc.constantFrom(...COMMAND_NAMES), secret, (command, value) => {
        const r = parseHostMessage({ kind: 'command', id: 1, command, payload: { injected: value, selectionToken: value, key: value } });
        return r.ok || !JSON.stringify(r.error).includes(value);
      }),
    );
  });

  it('a command that validates keeps exactly its payload (no extra keys survive strict schemas)', () => {
    fc.assert(
      fc.property(fc.constantFrom('ar', 'en', 'system'), fc.string({ minLength: 1, maxLength: 8 }), (value, extra) => {
        const r = parseHostMessage({ kind: 'command', id: 1, command: 'settings.set', payload: { key: 'ui.language', value, [`x${extra}`]: 1 } });
        return !r.ok;
      }),
    );
  });
});
