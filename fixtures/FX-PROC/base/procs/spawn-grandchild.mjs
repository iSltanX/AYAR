// ابن يطلق الحفيد المتجاهل لـ SIGTERM في مجموعته نفسها، ثم ينتظر.
import { spawn } from 'node:child_process';
import { recordPid } from '../lib/pids.js';

recordPid(process.pid);
spawn(process.execPath, [new URL('./ignore-sigterm.mjs', import.meta.url).pathname], { stdio: 'ignore' });
setTimeout(() => process.exit(0), 10 * 60 * 1000);
