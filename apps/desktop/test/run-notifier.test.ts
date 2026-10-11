// 13.3 «الإشعارات» (DEV-12): one notification per run, on its passage from active to ended, only while the window is
// not in front and the setting allows it; its title says the kind with the verdict, or that it was cancelled.
import { describe, expect, it } from 'vitest';
import { RunNotifier, type RunStateLike } from '../src/main/run-notifier.ts';

function notifier(o: { enabled?: boolean; focused?: boolean } = {}) {
  const shown: { title: string; body: string }[] = [];
  const n = new RunNotifier({ enabled: () => Promise.resolve(o.enabled ?? true), focused: () => o.focused ?? false, show: (title, body) => shown.push({ title, body }), lang: () => 'ar' });
  return { n, shown };
}
const run = (state: string, extra: Partial<RunStateLike> = {}): RunStateLike => ({ runId: 'run_1', state, kind: 'full', verdict: null, cancelReason: null, ...extra });
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('RunNotifier', () => {
  it('notifies once when a run ends with its verdict, never for a run it did not see running', async () => {
    const { n, shown } = notifier();
    n.onRunState(run('finished', { runId: 'run_0' }));
    n.onRunState(run('running'));
    n.onRunState(run('finished', { verdict: 'blocked' }));
    n.onRunState(run('finished', { verdict: 'blocked' }));
    await settle();
    expect(shown).toEqual([{ title: 'انتهى فحص كامل: محجوب', body: 'افتح عِيَار لقراءة النتائج.' }]);
  });

  it('says a cancelled run was cancelled, and stays silent when the window is in front or the setting is off', async () => {
    const a = notifier();
    a.n.onRunState(run('running'));
    a.n.onRunState(run('finished', { cancelReason: 'disk_full' }));
    await settle();
    expect(a.shown.map((x) => x.title)).toEqual(['أُلغي فحص كامل']);
    for (const o of [{ focused: true }, { enabled: false }]) {
      const b = notifier(o);
      b.n.onRunState(run('running'));
      b.n.onRunState(run('finished'));
      await settle();
      expect(b.shown).toEqual([]);
    }
  });
});
