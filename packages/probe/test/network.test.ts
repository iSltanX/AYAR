// C-14 «شبكة المسبار»: what the probe's pages may reach (this machine, the extension, inline data; hosts allowed by
// name), how a declared simulation matches a request, and what the log keeps of an address (never its query).
import { describe, expect, it } from 'vitest';
import { judgeUrl, mockMatches, proxyArgs, shownUrl } from '../src/driver/network.ts';
import { resolveInside, serveFolder } from '../src/driver/server.ts';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('the network rule', () => {
  it('lets this machine, the extension and inline data through, and refuses the rest', () => {
    for (const u of ['http://127.0.0.1:4173/api', 'http://localhost/x', 'http://[::1]:8080/', 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html', 'data:text/plain,x', 'blob:http://127.0.0.1/1']) expect(judgeUrl(u, []).kind, u).toBe('local');
    for (const u of ['https://fonts.googleapis.com/css2?family=Cairo', 'http://93.184.216.34/', 'wss://example.com/s', 'ftp://example.com/', 'http://127.0.0.1.nip.io/', 'not a url']) expect(judgeUrl(u, []).kind, u).toBe('blocked');
  });
  it('lets a host allowed by name through, and only that host', () => {
    expect(judgeUrl('https://fonts.googleapis.com/css2', ['fonts.googleapis.com']).kind).toBe('allowed');
    expect(judgeUrl('https://evil.fonts.googleapis.com.example/x', ['fonts.googleapis.com']).kind).toBe('blocked');
  });
  it('keeps the method, host and path of a request, never its query', () => {
    expect(shownUrl('GET', 'https://api.example.com/v1/items?token=secret#x')).toBe('GET https://api.example.com/v1/items');
  });
  it('matches a simulation by path, with * within a segment and ** across', () => {
    expect(mockMatches('/api/items', 'http://127.0.0.1:1/api/items?page=2')).toBe(true);
    expect(mockMatches('/api/items', 'http://127.0.0.1:1/api/items/1')).toBe(false);
    expect(mockMatches('/api/*/detail', 'http://127.0.0.1:1/api/7/detail')).toBe(true);
    expect(mockMatches('/api/*', 'http://127.0.0.1:1/api/7/detail')).toBe(false);
    expect(mockMatches('/api/**', 'http://127.0.0.1:1/api/7/detail')).toBe(true);
    expect(mockMatches('/search?q=x', 'http://127.0.0.1:1/search?q=x')).toBe(true);
  });
  it('sends what the handler cannot see to a proxy that does not exist, except this machine and the allowed hosts', () => {
    expect(proxyArgs(['fonts.example.org'])).toEqual(['--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1;localhost;[::1];fonts.example.org']);
  });
});

describe('the static folder (C-14: 127.0.0.1, a random port, no listing, nothing outside)', () => {
  it('serves a file inside, index.html for a folder, and nothing outside or through a link that leaves', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ayar-DEV-7-serve-'));
    try {
      const root = join(dir, 'site');
      mkdirSync(join(root, 'sub'), { recursive: true });
      mkdirSync(join(root, 'empty'));
      writeFileSync(join(root, 'index.html'), '<h1>x</h1>');
      writeFileSync(join(root, 'sub', 'index.html'), 'sub');
      writeFileSync(join(dir, 'secret.txt'), 'secret');
      symlinkSync(join(dir, 'secret.txt'), join(root, 'leak.txt'));
      expect(resolveInside(root, '/')).toMatch(/site\/index\.html$/);
      expect(resolveInside(root, '/sub/')).toMatch(/sub\/index\.html$/);
      expect(resolveInside(root, '/empty/')).toBeNull();
      expect(resolveInside(root, '/../secret.txt')).toBeNull();
      expect(resolveInside(root, '/%2e%2e/secret.txt')).toBeNull();
      expect(resolveInside(root, '/leak.txt')).toBeNull();
      const s = await serveFolder(root);
      try {
        expect(s.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
        const ok = await fetch(`${s.url}/`);
        expect([ok.status, ok.headers.get('content-type'), await ok.text()]).toEqual([200, 'text/html; charset=utf-8', '<h1>x</h1>']);
        expect((await fetch(`${s.url}/empty/`)).status).toBe(404);
        expect((await fetch(`${s.url}/leak.txt`)).status).toBe(404);
        expect((await fetch(`${s.url}/`, { method: 'POST' })).status).toBe(405);
      } finally {
        await s.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
