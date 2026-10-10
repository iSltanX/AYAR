// The app's own protocol (15.2 «المحتوى»): the UI loads from app://ayar/, never from file://. Only files under
// the renderer folder are served, each with the CSP header; anything else answers 404 without a path.
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { APP_HOST, CSP } from './security.ts';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

/** The file a request maps to, or null when it is outside the renderer folder or not a known type. */
export function resolveAppFile(url: string, root: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.host !== APP_HOST) return null;
  let pathname: string;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0')) return null;
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  const file = normalize(join(root, pathname));
  if (!file.startsWith(root + sep)) return null;
  if (!(extname(file).toLowerCase() in TYPES)) return null;
  return file;
}

export function securityHeaders(contentType: string): Record<string, string> {
  return {
    'Content-Type': contentType,
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Referrer-Policy': 'no-referrer',
  };
}

export async function serveAppRequest(url: string, root: string): Promise<Response> {
  const file = resolveAppFile(url, root);
  if (!file) return new Response('not found', { status: 404, headers: securityHeaders('text/plain; charset=utf-8') });
  try {
    const body = await readFile(file);
    return new Response(body, { status: 200, headers: securityHeaders(TYPES[extname(file).toLowerCase()]!) });
  } catch {
    return new Response('not found', { status: 404, headers: securityHeaders('text/plain; charset=utf-8') });
  }
}
