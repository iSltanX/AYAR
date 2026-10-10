// G-19 and G-18: the command and event ownership tables, generated from the registries so they cannot drift.
// packages/protocol/README.md carries the same tables; a test keeps them in sync.
import { COMMANDS, COMMAND_NAMES } from './commands/index.ts';
import { EVENTS, EVENT_TOPICS } from './events/index.ts';

export interface CommandOwnership {
  command: string;
  owner: string;
  handler: string;
  audience: string;
  grants: string;
  implementedIn: string;
}

export function commandOwnership(): CommandOwnership[] {
  return COMMAND_NAMES.map((command) => {
    const d = COMMANDS[command];
    return {
      command,
      owner: d.owner,
      handler: d.handler,
      audience: d.audience,
      grants: d.grants.map((g) => g.kind).join(', ') || '—',
      implementedIn: d.implementedIn,
    };
  });
}

export function eventOwnership(): { topic: string; owner: string; implementedIn: string }[] {
  return EVENT_TOPICS.map((topic) => ({ topic, owner: EVENTS[topic].owner, implementedIn: EVENTS[topic].implementedIn }));
}

/** The markdown rows of the README tables. */
export function ownershipMarkdown(): { commands: string; events: string } {
  const commands = [
    '| الأمر | المالك | المنفّذ | من يستدعيه | المنح المطلوبة | المرحلة |',
    '|---|---|---|---|---|---|',
    ...commandOwnership().map((r) => `| \`${r.command}\` | ${r.owner} | ${r.handler} | ${r.audience} | ${r.grants} | ${r.implementedIn} |`),
  ].join('\n');
  const events = [
    '| الحدث | المالك | المرحلة |',
    '|---|---|---|',
    ...eventOwnership().map((r) => `| \`${r.topic}\` | ${r.owner} | ${r.implementedIn} |`),
  ].join('\n');
  return { commands, events };
}
