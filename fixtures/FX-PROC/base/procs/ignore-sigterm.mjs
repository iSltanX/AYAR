// حفيد عنيد يتجاهل SIGTERM وSIGINT معًا: لا يموت إلا بـ SIGKILL، فيُختبر تصعيد الإشارات إلى آخره (G-DEV2-04،
// AT-11). ينتهي من نفسه بعد 10 دقائق.
import { recordPid } from '../lib/pids.js';

recordPid(process.pid);
process.on('SIGTERM', () => {
  /* يتجاهل */
});
process.on('SIGINT', () => {
  /* يتجاهل */
});
setTimeout(() => process.exit(0), 10 * 60 * 1000);
