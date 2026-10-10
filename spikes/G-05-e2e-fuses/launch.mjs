// G-05: can Playwright's _electron drive a given packaged app?
// Usage: node launch.mjs "<path to .app>" <label>
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const [appPath, label = 'run'] = process.argv.slice(2);
const executablePath = path.join(appPath, 'Contents/MacOS', path.basename(appPath, '.app'));
const result = { label, appPath: path.basename(appPath), startedAt: new Date().toISOString() };
const t0 = Date.now();
let app;
try {
  app = await electron.launch({ executablePath, args: ['--no-selftest'], timeout: 30000 });
  result.launched = true;
  const win = await app.firstWindow({ timeout: 15000 });
  result.title = await win.title();
  result.monoText = await win.textContent('#mono-latin');
  result.mainEval = await app.evaluate(({ app: a }) => ({ name: a.getName(), packaged: a.isPackaged }));
  result.ok = true;
} catch (e) {
  result.ok = false;
  result.error = String(e?.message || e).split('\n').slice(0, 12).join('\n');
} finally {
  result.ms = Date.now() - t0;
  if (app) await app.close().catch(() => {});
}
fs.mkdirSync('results', { recursive: true });
fs.writeFileSync(`results/launch-${label}.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
