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
