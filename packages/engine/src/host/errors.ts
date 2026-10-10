import { protocolError, type ErrorCode, type ErrorDetails, type ProtocolError } from '@ayar/protocol';

/** An expected failure a handler reports as a coded response. Anything else crashes the engine (C-04). */
export class CommandError extends Error {
  readonly error: ProtocolError;
  constructor(code: ErrorCode, details: ErrorDetails = {}) {
    super(code);
    this.name = 'CommandError';
    this.error = protocolError(code, details);
  }
}

/** Exit codes of the engine process, read by the supervisor (sysexits.h). */
export const EXIT = {
  ok: 0,
  /** EX_SOFTWARE: an unhandled exception ended the engine on purpose (C-04). */
  crash: 70,
  /** EX_PROTOCOL: the host speaks another major protocol version; restarting will not help. */
  protocolMismatch: 76,
} as const;

/**
 * A file-system failure at a command's boundary, as a coded answer instead of an engine crash (review M5):
 * a refusal (privacy, read-only volume) is permission_denied, a vanished path is path_missing, the rest internal.
 */
export function fsError(e: unknown, details: ErrorDetails = {}): CommandError {
  const code = (e as { code?: string } | null)?.code ?? '';
  if (['EACCES', 'EPERM', 'EROFS'].includes(code)) return new CommandError('permission_denied', { ...details, error: code });
  if (['ENOENT', 'ENOTDIR', 'ELOOP', 'ENOTFILE'].includes(code)) return new CommandError('path_missing', { ...details, error: code });
  return new CommandError('internal', { ...details, error: code || 'unknown' });
}

/** Runs a file-system step, mapping its failure to a coded answer. A CommandError passes through unchanged. */
export async function withFs<T>(fn: () => Promise<T>, details: ErrorDetails = {}): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof CommandError) throw e;
    throw fsError(e, details);
  }
}
