// C-14 «مجلد ثابت يخدمه عِيَار على 127.0.0.1 بمنفذ عشوائي، بلا فهرسة مجلدات وبحصر للمسارات داخل المجلد»: a folder
// served to the probe's pages only. A path is resolved inside the folder and its real path (links followed by the
// system) must stay inside the folder's real path; a folder answers with its index.html or 404, never a listing;
// only GET and HEAD; nothing is written.
import { createReadStream, realpathSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

export interface StaticServer {
  url: string;
  close(): Promise<void>;
}

/** The file a request path names inside the root, or null (outside it, a folder without index.html, absent). */
export function resolveInside(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]!.split('#')[0]!);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  let realRoot: string;
  try {
    realRoot = realpathSync(root);
  } catch {
    return null;
  }
  const candidate = normalize(join(realRoot, decoded));
  if (candidate !== realRoot && !candidate.startsWith(realRoot + sep)) return null;
  let real: string;
  try {
    real = realpathSync(candidate);
  } catch {
    return null;
  }
  if (real !== realRoot && !real.startsWith(realRoot + sep)) return null;
  try {
    const st = statSync(real);
    if (st.isFile()) return real;
    if (!st.isDirectory()) return null;
    const realIndex = realpathSync(join(real, 'index.html'));
    return statSync(realIndex).isFile() && realIndex.startsWith(realRoot + sep) ? realIndex : null;
  } catch {
    return null;
  }
}

export function serveFolder(root: string): Promise<StaticServer> {
  const server: Server = createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }
    const file = resolveInside(root, new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = createReadStream(file);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const a = server.address();
      const port = typeof a === 'object' && a ? a.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}
