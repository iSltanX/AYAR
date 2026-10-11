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
  // DEV-4 (protocol 1.1): the catalog, the project registry and the profile.
  'catalog_invalid',
  'permission_denied',
  'path_missing',
  'not_a_directory',
  'profile_invalid',
  'stale_change_set',
  'preview_required',
  // DEV-5 (protocol 1.2): plans, runs, setup and managed tools.
  /** The selection cannot be planned: a required check excluded, an unknown instance, nothing applicable. */
  'plan_invalid',
  /** The plan was frozen by a run, or the profile changed since it was built: plan again. */
  'plan_stale',
  /** FR-55: a project command in «مشروع غير موثوق». */
  'untrusted_project',
  /** A downloaded tool failed its hash or signature check: deleted, with a security alert (C-11, T6). */
  'tool_rejected',
  'network_failed',
  'setup_failed',
  'disk_full',
  // DEV-9 (protocol 1.5): a report whose second redaction pass still finds a high-confidence secret (12.5 rule 1).
  'report_blocked',
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
