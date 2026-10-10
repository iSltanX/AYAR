// Node implementation of the Network port: C-11's downloads (managed tools, data assets), and nothing else. HTTPS
// only, redirects to HTTPS only, a size limit enforced while streaming, into a new file (O_EXCL, no link
// followed). Plain HTTP is accepted for this machine only, and only when the host allowed it for its tests
// (tools/cli's AT-35 server, fixtures/tools/tool-server): the app never does.
import { constants, promises as fsp } from 'node:fs';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { DownloadError, type Network } from '../ports/index.ts';

const MAX_REDIRECTS = 5;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

export interface NetworkOptions {
  /** Test hook from the host (never the renderer): plain HTTP to this machine. */
  allowLoopbackHttp?: boolean;
  /** No byte in or out for this long ends the download. */
  idleTimeoutMs?: number;
}

function allowed(url: URL, o: NetworkOptions): boolean {
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && o.allowLoopbackHttp === true && LOOPBACK.has(url.hostname);
}

function get(url: URL, o: NetworkOptions, signal: AbortSignal | undefined): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, { method: 'GET', headers: { 'user-agent': 'AYAR', accept: '*/*' }, ...(signal ? { signal } : {}) }, resolve);
    req.setTimeout(o.idleTimeoutMs ?? 30_000, () => req.destroy(new DownloadError('network', 'timeout')));
    req.once('error', (e) => reject(e instanceof DownloadError ? e : signal?.aborted ? new DownloadError('aborted', 'aborted') : new DownloadError('network', (e as NodeJS.ErrnoException).code ?? e.message)));
    req.end();
  });
}

export function nodeNetwork(o: NetworkOptions = {}): Network {
  return {
    ping(raw, timeoutMs) {
      return new Promise((resolve) => {
        let url: URL;
        try {
          url = new URL(raw);
        } catch {
          return resolve(null);
        }
        if (!LOOPBACK.has(url.hostname) || !['http:', 'https:'].includes(url.protocol)) return resolve(null);
        const req = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, { method: 'GET', rejectUnauthorized: false }, (res) => {
          res.resume();
          resolve(res.statusCode ?? null);
        });
        req.setTimeout(timeoutMs, () => req.destroy());
        req.once('error', () => resolve(null));
        req.end();
      });
    },
    async download(raw, dest, opts) {
      let url = new URL(raw);
      let res: IncomingMessage | null = null;
      for (let hop = 0; ; hop++) {
        if (!allowed(url, o)) throw new DownloadError('insecure_url', `refused ${url.protocol} ${url.hostname}`);
        res = await get(url, o, opts.signal);
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (hop >= MAX_REDIRECTS) throw new DownloadError('too_many_redirects', String(hop));
          url = new URL(res.headers.location, url);
          continue;
        }
        if (status !== 200) {
          res.resume();
          throw new DownloadError('http_status', String(status));
        }
        break;
      }
      const total = Number(res.headers['content-length'] ?? NaN);
      if (Number.isFinite(total) && total > opts.maxBytes) {
        res.destroy();
        throw new DownloadError('too_large', String(total));
      }
      const handle = await fsp.open(dest, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      let bytes = 0;
      try {
        for await (const chunk of res as AsyncIterable<Buffer>) {
          bytes += chunk.length;
          if (bytes > opts.maxBytes) throw new DownloadError('too_large', String(bytes));
          let off = 0;
          while (off < chunk.length) off += (await handle.write(chunk, off, chunk.length - off)).bytesWritten;
          opts.onProgress?.(bytes, Number.isFinite(total) ? total : null);
        }
        await handle.sync();
      } catch (e) {
        res.destroy();
        if (e instanceof DownloadError) throw e;
        throw opts.signal?.aborted ? new DownloadError('aborted', 'aborted') : new DownloadError('network', (e as NodeJS.ErrnoException).code ?? String(e));
      } finally {
        await handle.close();
      }
      return { bytes };
    },
  };
}
