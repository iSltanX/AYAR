// Shared primitive schemas. Internal ids never reach the user (14.2); display ids are separate columns.
import { z } from './zod.ts';

export const Id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/, 'invalid id');
export type Id = z.infer<typeof Id>;

/** Check instance key `checkId@component` (D-45). */
export const CheckInstanceKey = z.string().min(3).max(512).regex(/^[^@\s]+@[^@\s]+$/, 'invalid check instance key');

export const Lang = z.enum(['ar', 'en']);
export type Lang = z.infer<typeof Lang>;

/** ISO 8601 UTC timestamp, as stored and as carried in events (14.1). */
export const IsoTimestamp = z.iso.datetime({ offset: false });

/** Absolute POSIX path. Only the main process and the engine handle paths; the UI never sends one (D-29). */
export const AbsolutePath = z
  .string()
  .min(1)
  .max(4096)
  .refine((p) => p.startsWith('/') && !p.includes('\0'), 'not an absolute path');

/** Any JSON value, for fields whose domain contract is defined by a later phase. */
export const JsonValue = z.json();
export type JsonValue = z.infer<typeof JsonValue>;

/** A JSON object, for patches and options whose shape a later phase defines. */
export const JsonObject = z.record(z.string(), z.json());

export const ComponentId = z.string().regex(/^C-\d{2}$/);
export type ComponentId = `C-${string}`;
export type PhaseId = `DEV-${number}`;
