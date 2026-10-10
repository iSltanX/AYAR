// C-15 «السكربت المركب»: what a project script or command runs. A script that is one command of a known tool gets
// the adapter's flags after it (after `--` for npm, which needs it; pnpm 12, Yarn and Bun pass what follows the
// script's name to it as is, and pnpm passes a literal `--` on, so none is added for them). A composite script runs
// as approved; its flags reach only its last command (the manager appends them to the script's text), so they are
// added only when that last command is the tool; the direct call to the tool, with the script's options, is
// suggested either way. Nothing here runs a shell: the text is split the way a shell would split it, quotes kept.

/** Splits a shell line into its top-level commands (`&&`, `||`, `;`, `|`), each as an argument vector. */
export function splitScript(text: string): string[][] {
  const commands: string[][] = [];
  let argv: string[] = [];
  let word = '';
  let inWord = false;
  let quote: '"' | "'" | null = null;
  const endWord = () => {
    if (inWord) argv.push(word);
    word = '';
    inWord = false;
  };
  const endCommand = () => {
    endWord();
    if (argv.length) commands.push(argv);
    argv = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < text.length) word += text[++i];
      else word += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      inWord = true;
    } else if (c === '\\' && i + 1 < text.length) {
      word += text[++i];
      inWord = true;
    } else if (c === '&' && text[i + 1] === '&') {
      endCommand();
      i++;
    } else if (c === '|') {
      endCommand();
      if (text[i + 1] === '|') i++;
    } else if (c === ';' || c === '\n') endCommand();
    else if (c === ' ' || c === '\t') endWord();
    else {
      word += c;
      inWord = true;
    }
  }
  endCommand();
  return commands;
}

const MANAGERS = new Set(['npm', 'pnpm', 'yarn', 'bun']);
const base = (p: string) => p.split('/').pop() ?? p;

/**
 * The program a command line runs, under the wrappers that only find or start it: environment assignments,
 * `cross-env`, `npx`/`pnpm exec`/`yarn`/`bunx`/`npm exec --`, `uv run … --`, `poetry run`, `python -m <module>`
 * (the module is the program), and `node --test` («node-test»). Null for an empty line.
 */
export function programOf(argv: readonly string[]): { program: string; args: string[] } | null {
  let a = [...argv];
  for (let guard = 0; guard < 8 && a.length; guard++) {
    const p = base(a[0]!);
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(a[0]!)) a = a.slice(1);
    else if (p === 'cross-env') a = a.slice(1);
    else if (p === 'npx' || p === 'bunx' || p === 'pnpx') {
      a = a.slice(1);
      while (a[0]?.startsWith('-')) a = a.slice(1);
    }
    else if ((p === 'pnpm' || p === 'yarn' || p === 'bun') && (a[1] === 'exec' || a[1] === 'dlx' || a[1] === 'x')) a = a.slice(2);
    else if (p === 'yarn' && a[1] && a[1] !== 'run' && !a[1].startsWith('-')) a = a.slice(1);
    else if (p === 'npm' && a[1] === 'exec') a = a.slice(a.indexOf('--') > 0 ? a.indexOf('--') + 1 : 2);
    else if (p === 'uv' && a[1] === 'run') a = a.indexOf('--') > 0 ? a.slice(a.indexOf('--') + 1) : a.slice(2).filter((x) => !x.startsWith('-'));
    else if (p === 'poetry' && a[1] === 'run') a = a.slice(2);
    else if (/^python(3(\.\d+)?)?$/.test(p) && a[1] === '-m' && a[2]) return { program: a[2], args: a.slice(3) };
    else if (p === 'node' && a.includes('--test')) return { program: 'node-test', args: a.slice(1) };
    else return { program: p, args: a.slice(1) };
  }
  return null;
}

export interface ScriptShape {
  /** The commands of the script, in order. */
  commands: string[][];
  composite: boolean;
  /** The index of the command whose program is the tool, or -1. */
  toolAt: number;
  /** Flags appended to the script reach the tool (it is the last command). */
  reachable: boolean;
}

/** Where the tool sits in a script's text, by a predicate on the program. */
export function scriptShape(text: string, isTool: (program: string, args: readonly string[]) => boolean): ScriptShape {
  const commands = splitScript(text);
  const toolAt = commands.findIndex((c) => {
    const p = programOf(c);
    return p !== null && isTool(p.program, p.args);
  });
  return { commands, composite: commands.length > 1, toolAt, reachable: toolAt >= 0 && toolAt === commands.length - 1 };
}

/** The manager of a script command (`npm run test` → npm), or null for a tool call. */
export function managerOf(argv: readonly string[]): string | null {
  const p = base(argv[0] ?? '');
  return MANAGERS.has(p) ? p : null;
}

/** Appends arguments to a script run by its manager: after `--` for npm, as they are for the others. */
export function appendToScript(argv: readonly string[], extra: readonly string[]): string[] {
  if (!extra.length) return [...argv];
  return managerOf(argv) === 'npm' && !argv.includes('--') ? [...argv, '--', ...extra] : [...argv, ...extra];
}
