// Engine-side check of the grants the main process attached to a command (C-04: "يوزع الأوامر بصلاحياتها").
// The main process already validated the token itself (exists, unexpired, unused); this checks that each
// required grant is present, of the right kind, and that a confirmation is bound to this exact action.
import type { CommandName } from './commands/index.ts';
import { COMMANDS } from './commands/index.ts';
import { protocolError, type ProtocolError } from './errors.ts';
import { GLOBAL_TARGET, type Grants } from './tokens.ts';

export function confirmationTarget(targetField: string | null, payload: unknown): string {
  if (targetField === null) return GLOBAL_TARGET;
  const value = (payload as Record<string, unknown>)[targetField];
  return typeof value === 'string' ? value : '';
}

export function checkGrants(command: CommandName, payload: unknown, grants: Grants): ProtocolError | null {
  for (const req of COMMANDS[command].grants) {
    const grant = grants[req.field];
    if (!grant || grant.kind !== req.kind) return protocolError('grant_missing', { command, field: req.field });
    if (req.kind === 'confirmation' && grant.kind === 'confirmation') {
      const target = confirmationTarget(req.targetField, payload);
      if (grant.command !== command || grant.target !== target) {
        return protocolError('confirmation_mismatch', { command, field: req.field });
      }
    }
  }
  return null;
}
