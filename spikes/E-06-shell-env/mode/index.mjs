// E-06 mode for the shared spike app: the engine (utilityProcess) reads the login shell env.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const modeDir = path.dirname(fileURLToPath(import.meta.url));

export async function run({ app, Engine, info }) {
  const engine = new Engine();
  await engine.spawned;
  await engine.call('engine.load', { modulePath: pathToFileURL(path.join(modeDir, 'probe.mjs')).toString() });
  const report = {
    spike: 'E-06',
    at: new Date().toISOString(),
    buildInfo: info,
    launchedFrom: { ppid: process.ppid },
    mainEnv: { PATH: process.env.PATH, SHELL: process.env.SHELL ?? null, LANG: process.env.LANG ?? null },
    probe: await engine.call('e06.probe', { runs: 5 }),
    whence: await engine.call('e06.whence'),
  };
  const out = path.join(app.getPath('userData'), 'e06.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  app.quit();
}
