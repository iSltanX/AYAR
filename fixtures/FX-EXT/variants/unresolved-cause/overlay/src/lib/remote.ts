/** عنوان إعدادات الخدمة البعيدة؛ يُقرأ من البيئة. */
export function remoteConfigUrl(env: Record<string, string | undefined> = process.env): string | undefined {
  return env.FX_REMOTE_CONFIG_URL;
}
