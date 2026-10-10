/** يتحقق من مفتاح الاتصال بالخدمة (محاكاة). */
export function connect(apiKey: string): boolean {
  return apiKey.startsWith('ayr_test_');
}
