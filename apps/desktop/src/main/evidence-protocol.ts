// ayar-evidence:// (C-01, C-17, 15.2 img-src): the renderer shows evidence (a probe's screenshot, a diff) by a URL
// that carries only a short-lived, single-use token — `ayar-evidence://e/<token>`, the token in the path so its
// case survives — never a path. The main process asks the engine (internal.evidencePath, host only) for the file
// behind it: the engine checks the token, that the file is a regular file inside the evidence store with no link
// on the way, and that its hash still matches its index; anything else answers 404 without saying why.
import type { InvokeResult } from '@ayar/protocol';
import { securityHeaders } from './app-protocol.ts';

export const EVIDENCE_SCHEME = 'ayar-evidence';
// The whole URL, as Chromium hands it over: nothing before or after the token, no dot segments, no query.
const URL_FORM = /^ayar-evidence:\/\/e\/(evt_[A-Za-z0-9_-]{43})$/;

/** The token of an evidence URL, or null. */
export function evidenceToken(url: string): string | null {
  return URL_FORM.exec(url)?.[1] ?? null;
}

/** Evidence kinds and how they are served: images as PNG, everything else as plain text (never as HTML, T3). */
export function contentTypeOf(kind: string): string {
  return ['screenshot', 'baseline', 'diff', 'image'].includes(kind) ? 'image/png' : 'text/plain; charset=utf-8';
}

export interface EvidenceDeps {
  resolve(token: string): Promise<InvokeResult<unknown>>;
  readFile(path: string): Promise<Uint8Array>;
}

// The page (app://) and the evidence (ayar-evidence://) are different origins: an <img> is a no-cors request, so
// the resource policy must allow it to be embedded, or Chromium would refuse it (the token keeps it single-use).
const headers = (contentType: string) => ({ ...securityHeaders(contentType), 'Cross-Origin-Resource-Policy': 'cross-origin', 'Cache-Control': 'no-store' });
const notFound = () => new Response('not found', { status: 404, headers: headers('text/plain; charset=utf-8') });

export async function serveEvidence(url: string, deps: EvidenceDeps): Promise<Response> {
  const token = evidenceToken(url);
  if (!token) return notFound();
  const r = await deps.resolve(token).catch(() => null);
  if (!r?.ok) return notFound();
  const { path, kind, size } = r.result as { path: string; kind: string; size: number };
  try {
    const body = await deps.readFile(path);
    if (body.length !== size) return notFound(); // changed since the engine checked it
    return new Response(new Uint8Array(body), { status: 200, headers: headers(contentTypeOf(kind)) });
  } catch {
    return notFound();
  }
}
