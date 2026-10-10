// The one zod instance of the protocol. Every protocol module imports `z` from here, so this runs first.
// jitless: zod's JIT probes `new Function`, and under the app's strict CSP (15.2: no 'unsafe-eval') that probe
// is reported as a securitypolicyviolation even though zod catches the error. AT-30 requires zero violations.
import { z } from 'zod';

z.config({ jitless: true });

export { z };
