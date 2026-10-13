// An argument vector and its folder as one line to copy and run (12.1 «خطوات الإعادة», AUD-06): every word quoted
// as a shell needs it, so sh, bash and zsh read the same words back — a file name with a space, Arabic letters or a
// quote stays one argument — and the folder entered first. The executor never runs this text: it runs the argv.

/** A word left bare: no character a shell would expand, split or read as syntax. */
const BARE = /^[A-Za-z0-9_@%+:,./=-]+$/;
/** A template slot of an adapter's invocation (`{tool}`, `{reports}`): braces without a comma are literal. */
const SLOT = /^[A-Za-z0-9_@%+:./={}-]+$/;

/** One argument as a shell must be given it; the program word never bare with `=` (zsh and sh read an assignment). */
export function shellWord(word: string, program = false): string {
  const bare = (BARE.test(word) || (SLOT.test(word) && !word.includes('..'))) && !word.startsWith('=') && !(program && word.includes('='));
  return bare ? word : `'${word.replaceAll("'", `'\\''`)}'`;
}

/** The command line of an argv run in `cwd` (relative to the project's root; `.` or empty is the root itself). */
export function shellLine(argv: readonly string[], cwd?: string | null): string {
  const words = argv.map((a, i) => shellWord(a, i === 0)).join(' ');
  if (!cwd || cwd === '.') return words;
  return `cd ${shellWord(cwd.startsWith('-') ? `./${cwd}` : cwd)} && ${words}`;
}
