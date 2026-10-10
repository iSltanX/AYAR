// Token registry (D-DEV3-05): single use, kind and purpose binding, both clocks, bounded size.
import { describe, expect, it } from 'vitest';
import { TokenRegistry } from '../src/main/tokens.ts';

function registry(maxEntries?: number) {
  let wall = 1_800_000_000_000;
  let mono = 0;
  let seed = 0;
  const reg = new TokenRegistry({
    randomBytes: (n) => new Uint8Array(n).map((_, i) => (++seed * 31 + i) % 256),
    clock: { wall: () => wall, mono: () => mono },
    ...(maxEntries ? { maxEntries } : {}),
  });
  return { reg, sleep: (ms: number) => (wall += ms), awake: (ms: number) => ((wall += ms), (mono += ms)), setWall: (w: number) => (wall = w), wall: () => wall };
}
const sel = { kind: 'selection' as const, path: '/Users/me/p' };

describe('token registry', () => {
  it('gives a grant once', () => {
    const { reg } = registry();
    const t = reg.issue(sel);
    expect(t).toMatch(/^sel_[A-Za-z0-9_-]{43}$/);
    expect(reg.consume(t, 'selection')).toEqual(sel);
    expect(reg.consume(t, 'selection')).toBeNull();
  });

  it('refuses another kind or another purpose, and spends the token anyway', () => {
    const { reg } = registry();
    const a = reg.issue(sel, 'project.add');
    expect(reg.consume(a, 'destination', 'project.add')).toBeNull();
    expect(reg.consume(a, 'selection', 'project.add')).toBeNull();
    const b = reg.issue(sel, 'project.add');
    expect(reg.consume(b, 'selection', 'project.relocate')).toBeNull();
    expect(reg.consume(b, 'selection', 'project.add')).toBeNull();
  });

  it('expires by the wall clock while the machine sleeps, and by the monotonic clock while awake', () => {
    const r1 = registry();
    const t1 = r1.reg.issue({ kind: 'confirmation', command: 'runs.delete', target: 'r', digest: null });
    r1.sleep(2 * 60_000 + 1);
    expect(r1.reg.consume(t1, 'confirmation')).toBeNull();
    const r2 = registry();
    const t2 = r2.reg.issue(sel);
    r2.awake(5 * 60_000 + 1);
    expect(r2.reg.consume(t2, 'selection')).toBeNull();
  });

  it('treats a wall clock moved back as expired', () => {
    const r = registry();
    const t = r.reg.issue(sel);
    r.setWall(r.wall() - 1000);
    expect(r.reg.consume(t, 'selection')).toBeNull();
  });

  it('keeps at most maxEntries live tokens, dropping the oldest', () => {
    const { reg } = registry(3);
    const tokens = [1, 2, 3, 4, 5].map(() => reg.issue(sel));
    expect(reg.size).toBe(3);
    expect(reg.consume(tokens[0], 'selection')).toBeNull();
    expect(reg.consume(tokens[4], 'selection')).toEqual(sel);
  });
});
