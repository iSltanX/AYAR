// Entry point as a Node child process started with fork() (tools/cli and integration tests, D-19).
// AYAR_ENGINE_TEST_CRASH is a test hook: the engine crashes right after its boot. Never set by the app.
// AYAR_TEST_LOGIN_SHELL is another (C-07 tests): the login shell to read, chosen by the host process.
import { installCrashHandlers } from '../host/crash.ts';
import { startEngine } from '../host/engine.ts';
import { nodeIpcChannel } from '../node/channels.ts';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { nodePortsWith } from '../node/ports.ts';
import { nodeProbeHost } from '../node/probe.ts';
import type { BrowserBuild } from '../probe/browser.ts';
import { isVerdictWorker, runVerdictWorker } from '../verdict/thread.ts';

if (isVerdictWorker()) runVerdictWorker();
else main();

function main(): void {
  // AYAR_TEST_TOOL_REGISTRY (a JSON file of extra managed-tool entries) and AYAR_TEST_ALLOW_LOOPBACK_HTTP=1 are the
  // hooks of AT-35's local tool server: chosen by the host process, never shipped, never in the app's entry.
  const testToolRegistry = process.env.AYAR_TEST_TOOL_REGISTRY ? (JSON.parse(readFileSync(process.env.AYAR_TEST_TOOL_REGISTRY, 'utf8')) as unknown[]) : [];
  // C-14 under Node (G-47): the engine forks the probe's own entry, and axe-core is the probe package's copy.
  const probeEntry = fileURLToPath(import.meta.resolve('@ayar/probe/bin/node'));
  const probe = nodeProbeHost({ entry: probeEntry, axePath: createRequire(probeEntry).resolve('axe-core/axe.min.js') });
  const ports = { ...nodePortsWith({ network: { allowLoopbackHttp: process.env.AYAR_TEST_ALLOW_LOOPBACK_HTTP === '1' } }), probe };
  // AYAR_TEST_BROWSER_BUILD (a JSON file): the probe browser's build served by a loopback server (DEV-7's install test).
  const testBrowserBuild = process.env.AYAR_TEST_BROWSER_BUILD ? (JSON.parse(readFileSync(process.env.AYAR_TEST_BROWSER_BUILD, 'utf8')) as BrowserBuild) : null;
  const engine = startEngine({ ports, channel: nodeIpcChannel(), testLoginShell: process.env.AYAR_TEST_LOGIN_SHELL ?? null, testToolRegistry, testBrowserBuild, workerEntry: import.meta.url });
  installCrashHandlers(engine);
  if (process.env.AYAR_ENGINE_TEST_CRASH === 'after-boot') {
    // booted() is already resolved (with null) before the hello arrives: wait for a real boot result, so the crash
    // comes after the welcome and the boot however loaded the machine is (it was a 10 ms race with the handshake).
    const crashAfterBoot = (): void =>
      void engine.booted().then((r) =>
        r
          ? setTimeout(() => {
              throw new Error('test crash');
            }, 10)
          : setTimeout(crashAfterBoot, 20),
      );
    crashAfterBoot();
  }
}
