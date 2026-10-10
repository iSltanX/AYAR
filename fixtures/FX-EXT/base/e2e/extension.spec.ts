import path from 'node:path';
import { chromium, expect, test, type BrowserContext } from '@playwright/test';

const extensionPath = path.resolve(import.meta.dirname, '..', 'dist');

let context: BrowserContext;
let extensionId: string;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker');
  extensionId = new URL(worker.url()).host;
});

test.afterAll(async () => {
  await context.close();
});

test('عامل الخدمة مسجل بمعرّف الإضافة', () => {
  expect(extensionId).toMatch(/^[a-p]{32}$/);
});

test('النافذة المنبثقة تعدّ الكلمات بالعربية', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.locator('#input').fill('مرحبا بكم في عِيَار');
  await expect(page.locator('#result')).toContainText('٤');
});

test('صفحة الخيارات تُفتح دون أخطاء في وحدة التحكم', async () => {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.locator('#count-spaces').check();
  await expect(page.locator('#saved')).toHaveText('تم الحفظ');
  expect(errors).toEqual([]);
});
