// Entry point as a Node child process started with fork() (tools/cli and integration tests, D-19).
// AYAR_ENGINE_TEST_CRASH is a test hook: the engine crashes right after the welcome. Never set by the app.
// AYAR_TEST_LOGIN_SHELL is another (C-07 tests): the login shell to read, chosen by the host process.
import { installCrashHandlers } from '../host/crash.ts';
import { startEngine } from '../host/engine.ts';
import { nodeIpcChannel } from '../node/channels.ts';
import { nodePorts } from '../node/ports.ts';

const engine = startEngine({ ports: nodePorts, channel: nodeIpcChannel(), testLoginShell: process.env.AYAR_TEST_LOGIN_SHELL ?? null });
installCrashHandlers(engine);
if (process.env.AYAR_ENGINE_TEST_CRASH === 'after-boot') {
  void engine.booted().then(() => setTimeout(() => {
    throw new Error('test crash');
  }, 10));
}
