import { describe, expect, it } from 'vitest';
import { checkGrants } from '../src/index.ts';
import { token } from './helpers.ts';

describe('grants (C-04 permissions)', () => {
  const execute = { actionId: 'act-1', confirmationToken: token('cfm') };
  const confirmation = (command: string, target: string) => ({ kind: 'confirmation' as const, command, target, digest: 'd1' });

  it('setup.execute is refused without a confirmation grant', () => {
    expect(checkGrants('setup.execute', execute, {})).toMatchObject({ code: 'grant_missing', details: { field: 'confirmationToken' } });
  });

  it('refuses a grant of the wrong kind', () => {
    expect(checkGrants('setup.execute', execute, { confirmationToken: { kind: 'selection', path: '/x' } })).toMatchObject({ code: 'grant_missing' });
  });

  it('refuses a confirmation issued for another command or another target', () => {
    expect(checkGrants('setup.execute', execute, { confirmationToken: confirmation('tools.install', 'act-1') })).toMatchObject({ code: 'confirmation_mismatch' });
    expect(checkGrants('setup.execute', execute, { confirmationToken: confirmation('setup.execute', 'act-2') })).toMatchObject({ code: 'confirmation_mismatch' });
  });

  it('accepts a confirmation bound to this command and target', () => {
    expect(checkGrants('setup.execute', execute, { confirmationToken: confirmation('setup.execute', 'act-1') })).toBeNull();
  });

  it('binds data.purge to the global target', () => {
    const payload = { confirmationToken: token('cfm') };
    expect(checkGrants('data.purge', payload, { confirmationToken: confirmation('data.purge', '*') })).toBeNull();
    expect(checkGrants('data.purge', payload, { confirmationToken: confirmation('data.purge', 'x') })).toMatchObject({ code: 'confirmation_mismatch' });
  });

  it('path commands need their path grant', () => {
    const payload = { selectionToken: token('sel') };
    expect(checkGrants('project.add', payload, {})).toMatchObject({ code: 'grant_missing' });
    expect(checkGrants('project.add', payload, { selectionToken: { kind: 'selection', path: '/Users/me/p' } })).toBeNull();
  });

  it('commands without requirements need nothing', () => {
    expect(checkGrants('settings.get', {}, {})).toBeNull();
  });
});
