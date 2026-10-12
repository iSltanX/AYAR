// AUD-06: the command line a report gives to copy and run (12.1 «خطوات الإعادة») reads back, in sh, bash and zsh, as
// the very words the check ran with, in its folder: a file name with a space or Arabic letters, quotes, expansions.
// Each line is run here, by each shell, against a Node program that only prints the arguments it received.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { shellLine, shellWord } from '../src/executor/command-line.ts';

const SHELLS = ['/bin/sh', '/bin/bash', '/bin/zsh'];
const ECHO = [process.execPath, '-e', 'process.stdout.write(JSON.stringify({ cwd: process.cwd(), argv: process.argv.slice(1) }))'];
const WORDS = ['إثبات الفشل.mjs', "it's", 'a"b', '$HOME', '`id`', '$(id)', '*', '?', '[ab]', '~', '~/x', '=x', '{a,b}', '{x..y}', 'a b', '', '-n', '!x', 'semi;colon', 'new\nline', 'tab\there', '{targets}', '--flag=value', 'back\\slash', '#hash', '%P', 'a|b', '(x)', '<in', '>out', '&', 'é', 'x^y', 'é ‏rtl'];

const root = realpathSync(mkdtempSync(join(tmpdir(), 'ayar-AUD-06-')));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const run = (shell: string, line: string, cwd: string) => JSON.parse(execFileSync(shell, ['-c', line], { cwd, encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } })) as { cwd: string; argv: string[] };

describe('a command line to copy and run (AUD-06)', () => {
  it('every word reads back the same, in sh, bash and zsh', () => {
    const line = shellLine([...ECHO, ...WORDS]);
    for (const shell of SHELLS) expect(run(shell, line, root).argv, shell).toEqual(WORDS);
  });

  it('the folder is entered first, whatever its name, and the root needs no cd', () => {
    for (const dir of ['مجلد فيه مسافة', "it's here", '-dash', 'plain']) {
      mkdirSync(join(root, dir), { recursive: true });
      const line = shellLine([...ECHO, 'x'], dir);
      for (const shell of SHELLS) expect(run(shell, line, root), `${shell} ${dir}`).toEqual({ cwd: join(root, dir), argv: ['x'] });
    }
    expect(shellLine(['npm', 'test'], '.')).toBe('npm test');
    expect(shellLine(['npm', 'test'], null)).toBe('npm test');
  });

  it('keeps plain words and template slots readable, and never leaves a program word as an assignment', () => {
    expect(shellLine(['node', 'إثبات الفشل.mjs'])).toBe("node 'إثبات الفشل.mjs'");
    expect(shellLine(['{tool}', 'check', '--reporter=json', '{targets}'], 'packages/app')).toBe('cd packages/app && {tool} check --reporter=json {targets}');
    expect(shellWord("it's")).toBe(`'it'\\''s'`);
    expect(shellWord('A=1', true)).toBe("'A=1'");
    expect(shellWord('A=1')).toBe('A=1');
  });
});
