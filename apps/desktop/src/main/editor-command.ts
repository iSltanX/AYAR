// E-17 «افتح عند السطر» (DEV-12): the editor template of the settings as one program and its arguments. The template
// is split at spaces (no shell, no quoting), its first word is the program, and {file} and {line} are replaced in
// every word they appear in; a line the finding does not have reads 1. No template: E-17's default, `open -t`.

export interface EditorCommand {
  program: string;
  args: string[];
}

export function editorCommand(template: string | null, file: string, line: number | null): EditorCommand {
  if (!template) return { program: '/usr/bin/open', args: ['-t', file] };
  const words = template.trim().split(/\s+/).filter(Boolean);
  const fill = (w: string) => w.replaceAll('{file}', file).replaceAll('{line}', String(line ?? 1));
  const [program, ...rest] = words.map(fill);
  // The settings refuse a template without {file}; this is the main process's own check of what it runs.
  if (!program || !words.some((w) => w.includes('{file}'))) return { program: '/usr/bin/open', args: ['-t', file] };
  return { program, args: rest };
}
