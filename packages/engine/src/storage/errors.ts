import type { ErrorCode, ErrorDetails } from '@ayar/protocol';

/** A storage failure with the protocol code the host reports for it. */
export class StorageError extends Error {
  readonly code: ErrorCode;
  readonly details: ErrorDetails;
  constructor(code: ErrorCode, message: string, details: ErrorDetails = {}) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    this.details = details;
  }
}
