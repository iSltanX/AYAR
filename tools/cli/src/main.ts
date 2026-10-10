#!/usr/bin/env node
// ayar-cli: runs the engine without Electron, over the same protocol (D-19). For tests and development only:
// it uses the declared test HMAC key, so it refuses the app's own data folder unless told otherwise.
//   node tools/cli/src/main.ts --data-dir <dir> boot
//   node tools/cli/src/main.ts --data-dir <dir> invoke <command> [json-payload]
//     [--select <path>]       attach a selection grant to selectionToken (project.add, project.relocate)
//     [--source <path>]       attach a source grant to sourceToken (profile.import)
//     [--destination <path>]  attach a destination grant to destinationToken (profile.export)
//     [--confirm <target>]    attach a confirmation grant for this command and target (project.remove)
//     [--digest <digest>]     bind that confirmation to a preview's digest (setup.execute, tools.install)
//     [--wait <topic>]        after the command, wait for this event (discovery.done) and print it
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { isCommandName, isEventTopic } from '@ayar/protocol';
import { connectEngine } from './engine-client.ts';
import { confirmationGrant, pathGrant } from './grants.ts';

const USAGE = 'usage: ayar-cli --data-dir <dir> [--allow-app-data] (boot | invoke <command> [json] [--select|--source|--destination <path>] [--confirm <target> [--digest <digest>]] [--wait <topic>])';

function fail(message: string, code = 2): never {
  process.stderr.write(`${message}\n${USAGE}\n`);
  process.exit(code);
}

const args = process.argv.slice(2);
/** Takes `--name value` out of the arguments. */
function option(name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const value = args[i + 1];
  if (value === undefined) fail(`ayar-cli: ${name} needs a value`);
  args.splice(i, 2);
  return value;
}
const dataDirArg = option('--data-dir');
if (!dataDirArg) fail('ayar-cli: --data-dir is required');
const dataDir = resolve(dataDirArg);
const select = option('--select');
const source = option('--source');
const destination = option('--destination');
const confirmTarget = option('--confirm');
const confirmDigest = option('--digest');
const waitTopic = option('--wait');
const allowAppData = args.includes('--allow-app-data');
const rest = args.filter((a) => a !== '--allow-app-data');
/** Real path, case-folded (APFS is case-insensitive by default): resolves symbolic links and case variants. */
function canonical(p: string): string {
  let head = p;
  const tail: string[] = [];
  for (;;) {
    try {
      return join(realpathSync.native(head), ...tail.reverse()).toLowerCase();
    } catch {
      const parent = dirname(head);
      if (parent === head) return p.toLowerCase();
      tail.push(head.slice(parent.length + 1));
      head = parent;
    }
  }
}
if (!allowAppData && canonical(dataDir) === canonical(join(homedir(), 'Library', 'Application Support', 'AYAR'))) {
  fail("ayar-cli: refusing the app's own data folder (the CLI uses the public test HMAC key); pass --allow-app-data to insist");
}

const [verb, command, json] = rest;
if (verb !== 'boot' && verb !== 'invoke') fail(`ayar-cli: unknown action ${verb ?? '(none)'}`);
if (verb === 'invoke' && !isCommandName(command)) fail(`ayar-cli: unknown command ${command ?? '(none)'}`);

const engine = await connectEngine({ dataDir });
const health = await engine.waitForEvent('engine.health');
let ok = health.payload.state === 'ready';
if (verb === 'boot') {
  process.stdout.write(`${JSON.stringify({ welcome: engine.welcome, health: health.payload }, null, 2)}\n`);
} else {
  let payload: Record<string, unknown> = {};
  try {
    payload = json ? (JSON.parse(json) as Record<string, unknown>) : {};
  } catch {
    await engine.close();
    fail('ayar-cli: the payload is not valid JSON');
  }
  // The CLI is the host: it attaches the grants the main process would attach after a system dialog.
  let grants = {};
  for (const [kind, path, field] of [['selection', select, 'selectionToken'], ['source', source, 'sourceToken'], ['destination', destination, 'destinationToken']] as const) {
    if (!path) continue;
    const g = pathGrant(kind, resolve(path));
    payload[field] = g.token;
    grants = { ...grants, ...g.grants };
  }
  if (confirmTarget) {
    const g = confirmationGrant(command!, confirmTarget, confirmDigest ?? null);
    payload.confirmationToken = g.token;
    grants = { ...grants, ...g.grants };
  }
  const result = await engine.invoke(command as Parameters<typeof engine.invoke>[0], payload, grants);
  ok = result.ok;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (ok && waitTopic && isEventTopic(waitTopic)) {
    const event = await engine.waitForEvent(waitTopic, undefined, 120_000);
    process.stdout.write(`${JSON.stringify(event, null, 2)}\n`);
  }
}
const code = await engine.close();
process.exit(ok && code === 0 ? 0 : 1);
