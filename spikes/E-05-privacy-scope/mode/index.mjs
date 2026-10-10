// E-05 mode: how many privacy prompts does adding a project, discovering it and running its
// tests cost, per protected location? And after a relaunch, without the open panel (--replay)?
import { dialog } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const modeDir = path.dirname(fileURLToPath(import.meta.url));
const home = os.homedir();
const LOCATIONS = [
  ['documents', path.join(home, 'Documents/ayar-e05-probe'), 'المستندات'],
  ['desktop', path.join(home, 'Desktop/ayar-e05-probe'), 'سطح المكتب'],
  ['downloads', path.join(home, 'Downloads/ayar-e05-probe'), 'التنزيلات'],
  ['icloud', path.join(home, 'Library/Mobile Documents/com~apple~CloudDocs/ayar-e05-probe'), 'iCloud Drive'],
  ['external', '/Volumes/iSltanXx/ayar-e05-probe', 'القرص الخارجي'],
];

export async function run({ app, createWindow, Engine, info, readBundleId }) {
  const replay = process.argv.includes('--replay');
  const onlyIdx = process.argv.indexOf('--only');
  const only = onlyIdx > 0 ? process.argv[onlyIdx + 1] : null; // run a single location (re-pick)
  const win = createWindow({ width: 760, height: 520, title: `AYAR Spike — E-05 ${replay ? 'replay' : 'pick'}` });
  await win.loadURL('app://spike/index.html');
  const engine = new Engine();
  await engine.spawned;
  await engine.call('engine.load', { modulePath: pathToFileURL(path.join(modeDir, 'e05-engine.mjs')).toString() });
  const stateFile = path.join(app.getPath('userData'), 'e05-projects.json');
  const stored = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
  const report = { spike: 'E-05', mode: replay ? 'replay' : 'pick', at: new Date().toISOString(), bundleId: readBundleId(), buildInfo: info, locations: [] };
  const show = () => win.webContents.send('spike:report', report);

  for (const [key, dir, label] of LOCATIONS.filter(([k]) => !only || k === only)) {
    const entry = { key, label, t0: new Date().toISOString() };
    let root = stored[key];
    if (!replay) {
      const t = performance.now();
      const r = await dialog.showOpenDialog(win, {
        title: `E-05: ${label}`,
        message: `اختر المجلد ayar-e05-probe في «${label}» ثم اضغط Open`,
        defaultPath: dir,
        properties: ['openDirectory'],
      });
      entry.pick = { canceled: r.canceled, path: r.filePaths[0]?.replace(home, '~') ?? null, ms: Math.round(performance.now() - t) };
      root = r.filePaths[0];
      if (root) stored[key] = root;
    }
    if (root) {
      entry.discover = await engine.call('e05.discover', { root }, 600000);
      entry.test = await engine.call('e05.test', { root }, 600000);
    }
    entry.t1 = new Date().toISOString();
    report.locations.push(entry);
    show();
  }
  fs.writeFileSync(stateFile, JSON.stringify(stored, null, 2));
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(app.getPath('userData'), `e05-${report.mode}${only ? `-${only}` : ''}.json`), JSON.stringify(report, null, 2));
  show();
  if (process.argv.includes('--auto-quit')) setTimeout(() => app.quit(), 1500);
}
