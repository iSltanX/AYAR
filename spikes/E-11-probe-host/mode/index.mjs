// E-11 mode for the shared spike app (../E-01-electron-forge): the engine (utilityProcess) hosts playwright-core
// and drives Chromium with FX-EXT loaded as an extension, headless then headed. Parameters come from the JSON file
// named by SPIKE_E11_PARAMS (open(1) forwards the caller's environment, E-06). Writes <userData>/e11.json and quits.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const modeDir = path.dirname(fileURLToPath(import.meta.url));

export async function run({ app, Engine, info }) {
  const params = JSON.parse(fs.readFileSync(process.env.SPIKE_E11_PARAMS, 'utf8'));
  const engine = new Engine();
  await engine.spawned;
  const report = { spike: 'E-11', at: new Date().toISOString(), buildInfo: info, main: { pid: process.pid, ppid: process.ppid, electron: process.versions.electron, node: process.versions.node, chrome: process.versions.chrome } };
  try {
    await engine.call('engine.load', { modulePath: pathToFileURL(path.join(modeDir, 'probe.mjs')).toString() });
    report.engine = await engine.call('e11.info');
    report.runs = await engine.call('e11.run', params, 600000);
  } catch (e) {
    report.error = String(e?.stack || e);
  }
  report.engineStderr = engine.stderr.slice(-4000);
  report.finishedAt = new Date().toISOString();
  const out = path.join(app.getPath('userData'), 'e11.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  app.quit();
}
