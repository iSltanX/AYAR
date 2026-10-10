// تسجيل أرقام العمليات التي ينشئها السيناريو، ليتحقق الاختبار من بقائها أو موتها بعد انتهاء الفحص.
// الملف: المتغير FX_PROC_PIDS إن وُجد، وإلا ملف في المجلد المؤقت مفتاحه مسار المشروع (خارج المستودع).
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function pidFile() {
  if (process.env.FX_PROC_PIDS) return process.env.FX_PROC_PIDS;
  const key = crypto.createHash('sha1').update(process.cwd()).digest('hex').slice(0, 10);
  return path.join(os.tmpdir(), `ayar-fx-proc-${key}.pids`);
}

export function recordPid(pid, file = pidFile()) {
  fs.appendFileSync(file, `${pid}\n`);
}
