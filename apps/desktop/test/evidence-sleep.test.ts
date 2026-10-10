// Two DEV-5 parts of the main process: the ayar-evidence:// protocol (C-17, 15.2 img-src) serves a file only by
// a valid token the engine resolves, never by a path; and the sleep guard (FR-26) holds one power-save blocker
// while any run that asks for it is running, and releases it when none is.
import { protocolError } from '@ayar/protocol';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { contentTypeOf, evidenceToken, serveEvidence } from '../src/main/evidence-protocol.ts';
import { SleepGuard } from '../src/main/sleep-guard.ts';

const TOKEN = `evt_${'A'.repeat(43)}`;

describe('ayar-evidence://', () => {
  it('accepts only ayar-evidence://e/<token>', () => {
    expect(evidenceToken(`ayar-evidence://e/${TOKEN}`)).toBe(TOKEN);
    for (const bad of [
      `ayar-evidence://x/${TOKEN}`,
      `ayar-evidence://e/${TOKEN}?p=1`,
      `ayar-evidence://e/${TOKEN}#a`,
      `ayar-evidence://e/../${TOKEN}`,
      `ayar-evidence://e/evt_short`,
      `ayar-evidence://e//Users/me/.ssh/id_rsa`,
      `ayar://app/${TOKEN}`,
      `file:///e/${TOKEN}`,
      'not a url',
    ]) expect(evidenceToken(bad), bad).toBeNull();
  });

  it('serves the file the engine resolves, as an image or as plain text — never as HTML', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const asked: string[] = [];
    const res = await serveEvidence(`ayar-evidence://e/${TOKEN}`, {
      resolve: (t) => (asked.push(t), Promise.resolve({ ok: true, result: { path: '/data/evidence/a.png', kind: 'screenshot', size: 4, sha256: createHash('sha256').update(png).digest('hex') } })),
      readFile: () => Promise.resolve(png),
    });
    expect(asked).toEqual([TOKEN]);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(png);
    expect(contentTypeOf('log')).toBe('text/plain; charset=utf-8');
    expect(contentTypeOf('html')).toBe('text/plain; charset=utf-8');
  });

  it('answers 404, saying nothing, for a refused token, a vanished file, or one changed since it was checked', async () => {
    // (The served file must have the size and the hash the engine checked.)
    const url = `ayar-evidence://e/${TOKEN}`;
    const found = { ok: true as const, result: { path: '/p', kind: 'log', size: 3, sha256: createHash('sha256').update(new Uint8Array(3)).digest('hex') } };
    const cases = [
      { resolve: () => Promise.resolve({ ok: false as const, error: protocolError('token_invalid') }), readFile: () => Promise.resolve(new Uint8Array(3)) },
      { resolve: () => Promise.reject(new Error('engine gone')), readFile: () => Promise.resolve(new Uint8Array(3)) },
      { resolve: () => Promise.resolve(found), readFile: () => Promise.reject(new Error('ENOENT /p')) },
      { resolve: () => Promise.resolve(found), readFile: () => Promise.resolve(new Uint8Array(4)) },
      // Same size, other bytes: changed after the engine hashed it.
      { resolve: () => Promise.resolve(found), readFile: () => Promise.resolve(new Uint8Array([1, 2, 3])) },
    ];
    for (const deps of cases) {
      const res = await serveEvidence(url, deps);
      expect(res.status).toBe(404);
      expect(await res.text()).toBe('not found');
    }
    // A malformed URL never reaches the engine.
    let called = false;
    await serveEvidence('ayar-evidence://e/x', { resolve: () => ((called = true), Promise.resolve(found)), readFile: () => Promise.resolve(new Uint8Array(3)) });
    expect(called).toBe(false);
  });
});

describe('FR-26: the sleep guard', () => {
  const blocker = () => {
    const log: string[] = [];
    let n = 0;
    return { log, start: () => (log.push(`start ${++n}`), n), stop: (id: number) => void log.push(`stop ${id}`) };
  };

  it('holds one blocker while a run that asks for it is running or cancelling, and releases it after the last', () => {
    const b = blocker();
    const g = new SleepGuard(b);
    g.onRunState({ runId: 'r1', state: 'planned', preventSleep: true });
    expect(g.holding).toBe(false);
    g.onRunState({ runId: 'r1', state: 'running', preventSleep: true });
    g.onRunState({ runId: 'r2', state: 'running', preventSleep: true });
    g.onRunState({ runId: 'r1', state: 'cancelling', preventSleep: true });
    expect(g.holding).toBe(true);
    g.onRunState({ runId: 'r1', state: 'cancelled', preventSleep: true });
    expect(g.holding).toBe(true);
    g.onRunState({ runId: 'r2', state: 'finished', preventSleep: true });
    expect(g.holding).toBe(false);
    expect(b.log).toEqual(['start 1', 'stop 1']);
  });

  it('does nothing for a run that does not ask, and lets go when the engine restarts', () => {
    const b = blocker();
    const g = new SleepGuard(b);
    g.onRunState({ runId: 'r1', state: 'running', preventSleep: false });
    expect(b.log).toEqual([]);
    g.onRunState({ runId: 'r2', state: 'running', preventSleep: true });
    g.reset();
    expect(g.holding).toBe(false);
    expect(b.log).toEqual(['start 1', 'stop 1']);
  });
});
