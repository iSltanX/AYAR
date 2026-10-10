import { slug } from 'ayar-vuln-fake';

/** يحوّل نصًّا إلى معرّف صالح للروابط. */
export function toSlug(text: string): string {
  return slug(text);
}
