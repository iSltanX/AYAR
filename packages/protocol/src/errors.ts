// Coded errors (C-04): every failed command or refused connection carries a code and an i18n message key
// (`errors.<code>` in packages/i18n/messages/errors.*.json). Details never carry secrets or project paths.
import { z } from './zod.ts';

export const ERROR_CODES = [
  'unknown_command',
  'invalid_message',
  'invalid_payload',
  'invalid_result',
  'untrusted_sender',
  'not_implemented',
  'grant_missing',
  'token_invalid',
  'confirmation_mismatch',
  'engine_starting',
  'engine_unavailable',
  'engine_failed',
  'protocol_mismatch',
  'db_corrupt',
  'db_newer_than_app',
  'data_dir_unsafe',
  'busy',
  'not_found',
  'cancelled',
  'internal',
] as const;

export const ErrorCode = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorDetails = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));
export type ErrorDetails = z.infer<typeof ErrorDetails>;

export const ProtocolError = z.strictObject({
  code: ErrorCode,
  messageKey: z.string().regex(/^errors\.[a-z_]+$/),
  details: ErrorDetails,
});
export type ProtocolError = z.infer<typeof ProtocolError>;

export function protocolError(code: ErrorCode, details: ErrorDetails = {}): ProtocolError {
  return { code, messageKey: `errors.${code}`, details };
}
