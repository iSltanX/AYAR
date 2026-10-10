// حفيد يتجاهل SIGTERM: لا يموت إلا بـ SIGKILL. ينتهي من نفسه بعد 10 دقائق.
import { recordPid } from '../lib/pids.js';

recordPid(process.pid);
process.on('SIGTERM', () => {
  /* يتجاهل */
});
setTimeout(() => process.exit(0), 10 * 60 * 1000);
