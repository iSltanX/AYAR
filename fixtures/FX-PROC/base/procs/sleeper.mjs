// عملية تنام 10 دقائق ثم تنتهي (لا تبقى للأبد إن فات التنظيف). تسجل رقمها في الملف المعطى (argv[2]) أو الافتراضي.
import { recordPid } from '../lib/pids.js';

recordPid(process.pid, process.argv[2]);
setTimeout(() => process.exit(0), 10 * 60 * 1000);
