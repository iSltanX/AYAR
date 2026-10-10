// Wire messages between a host (the main process, or tools/cli) and the engine (D-29). Every message is
// checked against these schemas on both sides; anything else is rejected and logged.
import { AbsolutePath, IsoTimestamp } from './common.ts';
import { COMMANDS, isCommandName, type CommandName } from './commands/index.ts';
import { protocolError, ProtocolError, type ErrorDetails } from './errors.ts';
import { EVENTS, HmacKeySource, isEventTopic, type EventPayload, type EventTopic } from './events/index.ts';
import { Grants } from './tokens.ts';
import { ProtocolVersion } from './version.ts';
import { z } from './zod.ts';

export const RequestId = z.int().positive();
/** An event stream: one per engine session, plus the supervisor's own stream. Resets of seq are detectable. */
export const StreamId = z.string().regex(/^[a-z]+-[A-Za-z0-9_-]{6,64}$/);

export const HostConfig = z.strictObject({
  dataDir: AbsolutePath,
  hmacKeySource: HmacKeySource,
  appVersion: z.string().min(1).max(64),
});
export type HostConfig = z.infer<typeof HostConfig>;

export const Hello = z.strictObject({
  kind: z.literal('hello'),
  protocol: ProtocolVersion,
  peer: z.enum(['desktop', 'cli']),
  config: HostConfig,
});
export type Hello = z.infer<typeof Hello>;

export const Welcome = z.strictObject({
  kind: z.literal('welcome'),
  protocol: ProtocolVersion,
  engine: z.strictObject({ version: z.string().min(1), pid: z.int().nonnegative(), stream: StreamId }),
});
export type Welcome = z.infer<typeof Welcome>;

export const Refuse = z.strictObject({ kind: z.literal('refuse'), protocol: ProtocolVersion, error: ProtocolError });
export type Refuse = z.infer<typeof Refuse>;

export const CommandMessage = z.strictObject({
  kind: z.literal('command'),
  id: RequestId,
  command: z.string().min(1).max(64),
  payload: z.unknown(),
  grants: Grants.optional(),
});
export type CommandMessage = z.infer<typeof CommandMessage>;

export const ResponseMessage = z.union([
  z.strictObject({ kind: z.literal('response'), id: RequestId, ok: z.literal(true), result: z.unknown() }),
  z.strictObject({ kind: z.literal('response'), id: RequestId, ok: z.literal(false), error: ProtocolError }),
]);
export type ResponseMessage = z.infer<typeof ResponseMessage>;

export const EventMessage = z.strictObject({
  kind: z.literal('event'),
  stream: StreamId,
  seq: z.int().positive(),
  topic: z.string().min(1).max(64),
  at: IsoTimestamp,
  payload: z.unknown(),
});
export type EventMessage = z.infer<typeof EventMessage>;

export const ShutdownMessage = z.strictObject({ kind: z.literal('shutdown') });

/** A validated event whose payload matched its topic's schema. */
export type ParsedEvent<T extends EventTopic = EventTopic> = {
  kind: 'event';
  stream: string;
  seq: number;
  topic: T;
  at: string;
  payload: EventPayload<T>;
};

/** A validated command whose payload matched its command's schema. */
export type ParsedCommand = { kind: 'command'; id: number; command: CommandName; payload: unknown; grants: Grants };

export type HostMessage = Hello | ParsedCommand | { kind: 'shutdown' };
export type EngineMessage = Welcome | Refuse | ResponseMessage | ParsedEvent;

export type Parsed<T> = { ok: true; message: T } | { ok: false; error: ProtocolError };

/** Summarises zod issues by path and message only, never by value: inputs may carry secrets or paths. */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 8)
    .map((i) => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`)
    .join('; ')
    .slice(0, 600);
}

function invalid(code: 'invalid_message' | 'invalid_payload' | 'unknown_command', details: ErrorDetails): { ok: false; error: ProtocolError } {
  return { ok: false, error: protocolError(code, details) };
}

const kindOf = (raw: unknown): unknown => (typeof raw === 'object' && raw !== null ? (raw as { kind?: unknown }).kind : undefined);

/** Validates a command's payload against the registry. */
export function parseCommandPayload(command: CommandName, payload: unknown): { ok: true; payload: unknown } | { ok: false; error: ProtocolError } {
  const r = COMMANDS[command].payload.safeParse(payload);
  if (!r.success) return { ok: false, error: protocolError('invalid_payload', { command, issues: describeIssues(r.error) }) };
  return { ok: true, payload: r.data };
}

/** Engine side: validates what a host sent. A command's id is reported even when the rest is invalid. */
export function parseHostMessage(raw: unknown): Parsed<HostMessage> & { id?: number } {
  switch (kindOf(raw)) {
    case 'hello': {
      const r = Hello.safeParse(raw);
      return r.success ? { ok: true, message: r.data } : invalid('invalid_message', { kind: 'hello', issues: describeIssues(r.error) });
    }
    case 'shutdown': {
      const r = ShutdownMessage.safeParse(raw);
      return r.success ? { ok: true, message: r.data } : invalid('invalid_message', { kind: 'shutdown', issues: describeIssues(r.error) });
    }
    case 'command': {
      const r = CommandMessage.safeParse(raw);
      if (!r.success) return invalid('invalid_message', { kind: 'command', issues: describeIssues(r.error) });
      const { id, command, payload, grants } = r.data;
      if (!isCommandName(command)) return { ...invalid('unknown_command', { command }), id };
      const p = parseCommandPayload(command, payload);
      if (!p.ok) return { ok: false, error: p.error, id };
      return { ok: true, message: { kind: 'command', id, command, payload: p.payload, grants: grants ?? {} }, id };
    }
    default:
      return invalid('invalid_message', { kind: typeof kindOf(raw) === 'string' ? String(kindOf(raw)) : 'missing' });
  }
}

/** Validates one event: the envelope, a known topic, and the topic's payload. */
export function parseEvent(raw: unknown): Parsed<ParsedEvent> {
  const r = EventMessage.safeParse(raw);
  if (!r.success) return invalid('invalid_message', { kind: 'event', issues: describeIssues(r.error) });
  const { topic } = r.data;
  if (!isEventTopic(topic)) return invalid('invalid_message', { kind: 'event', topic });
  const p = EVENTS[topic].payload.safeParse(r.data.payload);
  if (!p.success) return invalid('invalid_payload', { kind: 'event', topic, issues: describeIssues(p.error) });
  return { ok: true, message: { ...r.data, topic, payload: p.data } };
}

/** Host side: validates what the engine sent. Response results are checked later, against the request. */
export function parseEngineMessage(raw: unknown): Parsed<EngineMessage> {
  switch (kindOf(raw)) {
    case 'welcome': {
      const r = Welcome.safeParse(raw);
      return r.success ? { ok: true, message: r.data } : invalid('invalid_message', { kind: 'welcome', issues: describeIssues(r.error) });
    }
    case 'refuse': {
      const r = Refuse.safeParse(raw);
      return r.success ? { ok: true, message: r.data } : invalid('invalid_message', { kind: 'refuse', issues: describeIssues(r.error) });
    }
    case 'response': {
      const r = ResponseMessage.safeParse(raw);
      return r.success ? { ok: true, message: r.data } : invalid('invalid_message', { kind: 'response', issues: describeIssues(r.error) });
    }
    case 'event':
      return parseEvent(raw);
    default:
      return invalid('invalid_message', { kind: typeof kindOf(raw) === 'string' ? String(kindOf(raw)) : 'missing' });
  }
}
