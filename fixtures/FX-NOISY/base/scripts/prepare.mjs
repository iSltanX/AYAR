// تجهيز قبل الاختبار: ينشئ مجلد التقارير. جزء من السكربت المركب «test».
import fs from 'node:fs';

fs.mkdirSync(new URL('../reports/', import.meta.url), { recursive: true });
