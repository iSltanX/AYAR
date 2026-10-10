// E-04 mode: does a stable self-signed identity keep privacy (Documents) and keychain grants
// across two different builds? Build tag A writes a safeStorage ciphertext, build B reads it.
import { safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const modeDir = path.dirname(fileURLToPath(import.meta.url));
const timed = (fn) => { const t = performance.now(); try { return { ok: true, value: fn(), ms: Math.round(performance.now() - t) }; } catch (e) { return { ok: false, error: String(e.message), ms: Math.round(performance.now() - t) }; } };

export async function run({ app, createWindow, Engine, info, readBundleId }) {
  const tag = info.buildTag || 'X';
  const win = createWindow({ width: 640, height: 360, title: `AYAR Spike — E-04 build ${tag}` });
  await win.loadURL('app://spike/index.html');
  const engine = new Engine();
  await engine.spawned;
  await engine.call('engine.load', { modulePath: pathToFileURL(path.join(modeDir, 'e04-engine.mjs')).toString() });
  const report = { spike: 'E-04', tag, at: new Date().toISOString(), bundleId: readBundleId(), buildInfo: info, steps: {} };
  report.steps.documentsReadInEngine = await engine.call('e04.read', {}, 600000);
  report.steps.documentsReadByChild = await engine.call('e04.childCat', {}, 600000);
  const cipherFile = path.join(app.getPath('userData'), 'e04-cipher.b64');
  report.steps.safeStorageAvailable = timed(() => safeStorage.isEncryptionAvailable());
  if (tag === 'A') {
    report.steps.safeStorage = timed(() => {
      const c = safeStorage.encryptString('ayar-e04-hmac-test');
      fs.writeFileSync(cipherFile, c.toString('base64'));
      return safeStorage.decryptString(c) === 'ayar-e04-hmac-test';
    });
  } else {
    report.steps.safeStorage = timed(() => safeStorage.decryptString(Buffer.from(fs.readFileSync(cipherFile, 'utf8'), 'base64')) === 'ayar-e04-hmac-test');
  }
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(app.getPath('userData'), `e04-${tag}.json`), JSON.stringify(report, null, 2));
  win.webContents.send('spike:report', report);
  if (process.argv.includes('--auto-quit')) setTimeout(() => app.quit(), 1500);
}
