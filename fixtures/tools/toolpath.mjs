// مسار الأدوات المشترك لمشغّلات fixtures: node الحالي أولًا، ثم مجلدات صندوق الأدوات (toolchain.json)، ثم PATH.
import os from 'node:os';
import path from 'node:path';
import { FIXTURES_ROOT, readJson } from './materialize.mjs';

export const toolchain = readJson(path.join(FIXTURES_ROOT, 'tools', 'toolchain.json'));
export const TC_HOME = (toolchain.home ?? '').replace(/^~/, os.homedir());

export function toolPath() {
  const extra = [path.dirname(process.execPath), ...(toolchain.path_dirs ?? []).map((d) => d.replace(/^~/, os.homedir()))];
  return [...extra, process.env.PATH].join(path.delimiter);
}
