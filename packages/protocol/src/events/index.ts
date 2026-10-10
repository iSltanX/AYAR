// The event registry: one file per domain, merged here (docs/waves/README.md 6).
import { discoveryEvents } from './discovery.ts';
import { engineEvents } from './engine.ts';
import { findingEvents } from './findings.ts';
import { runEvents } from './runs.ts';
import type { z } from '../zod.ts';

export const EVENTS = {
  ...discoveryEvents,
  ...runEvents,
  ...findingEvents,
  ...engineEvents,
};

export type EventTopic = keyof typeof EVENTS;
export type EventPayload<T extends EventTopic> = z.infer<(typeof EVENTS)[T]['payload']>;
export const EVENT_TOPICS = Object.keys(EVENTS) as [EventTopic, ...EventTopic[]];

export function isEventTopic(topic: unknown): topic is EventTopic {
  return typeof topic === 'string' && Object.hasOwn(EVENTS, topic);
}

export { EngineHealth, EngineState, HmacKeySource } from './engine.ts';
export type { EventDefinition } from './define.ts';
