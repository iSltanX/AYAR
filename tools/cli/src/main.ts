#!/usr/bin/env node
// ayar-cli: runs the engine without Electron, over the same protocol (D-19). For tests and development only:
// it uses the declared test HMAC key, so it refuses the app's own data folder unless told otherwise.
//   node tools/cli/src/main.ts --data-dir <dir> boot
//   node tools/cli/src/main.ts --data-dir <dir> invoke <command> [json-payload]
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { isCommandName } from '@ayar/protocol';
import { connectEngine } from './engine-client.ts';

const USAGE = 'usage: ayar-cli --data-dir <dir> [--allow-app-data] (boot | invoke <command> [json])';

function fail(message: string, code = 2): never {
  process.stderr.write(`${message}\n${USAGE}\n`);
  process.exit(code);
}

const args = process.argv.slice(2);
const at = args.indexOf('--data-dir');
if (at < 0 || !args[at + 1]) fail('ayar-cli: --data-dir is required');
const dataDir = resolve(args[at + 1]!);
const allowAppData = args.includes('--allow-app-data');
const rest = args.filter((a, i) => i !== at && i !== at + 1 && a !== '--allow-app-data');
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
  let payload: unknown = {};
  try {
    payload = json ? JSON.parse(json) : {};
  } catch {
    await engine.close();
    fail('ayar-cli: the payload is not valid JSON');
  }
  const result = await engine.invoke(command as Parameters<typeof engine.invoke>[0], payload);
  ok = result.ok;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
const code = await engine.close();
process.exit(ok && code === 0 ? 0 : 1);
