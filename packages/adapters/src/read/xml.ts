// C-15 «محلل XML دون DTD ودون توسيع كيانات»: a small non-validating reader for the reports AYAR reads (JUnit). A
// document type declaration is refused outright (`dtd`), so no entity can be declared, let alone expanded; only the
// five predefined entities and character references are decoded; an unknown entity, a tag that does not close, or a
// nesting deeper than the limit is a problem of its own. Comments and processing instructions are skipped.
import { problem, REPORT_LIMITS, type Read } from './guards.ts';

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  /** The element's own text (and CDATA), joined. */
  text: string;
  /** The 1-based line the element starts on. */
  line: number;
}

const PREDEFINED: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

class XmlError extends Error {
  readonly code: 'malformed' | 'dtd' | 'too_deep';
  constructor(code: 'malformed' | 'dtd' | 'too_deep', message: string) {
    super(message);
    this.code = code;
  }
}

function decode(s: string, line: number): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);?/g, (whole, ent: string) => {
    if (!whole.endsWith(';')) throw new XmlError('malformed', `line ${line}: an unterminated reference ${whole}`);
    if (ent.startsWith('#x')) return safeCodePoint(parseInt(ent.slice(2), 16), line);
    if (ent.startsWith('#')) return safeCodePoint(parseInt(ent.slice(1), 10), line);
    // Own entries only: `&toString;` is not one of the five.
    const v = Object.hasOwn(PREDEFINED, ent) ? PREDEFINED[ent] : undefined;
    if (v === undefined) throw new XmlError('malformed', `line ${line}: an undeclared entity &${ent}; (no DTD is read)`);
    return v;
  });
}

function safeCodePoint(n: number, line: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) throw new XmlError('malformed', `line ${line}: an invalid character reference`);
  return String.fromCodePoint(n);
}

const NAME = /^[A-Za-z_:][A-Za-z0-9_:.-]*/;

/** Parses an XML report within the limits; the root element, or the problem. */
export function readXml(text: string, file: string, o: { maxDepth?: number } = {}): Read<XmlElement> {
  const maxDepth = o.maxDepth ?? REPORT_LIMITS.maxXmlDepth;
  if (!text.trim()) return problem('empty', file, 'empty report');
  try {
    return { ok: true, value: parse(text, maxDepth) };
  } catch (e) {
    if (e instanceof XmlError) return problem(e.code, file, e.message);
    throw e;
  }
}

function parse(text: string, maxDepth: number): XmlElement {
  let i = 0;
  let line = 1;
  const stack: XmlElement[] = [];
  let root: XmlElement | null = null;
  const advance = (to: number) => {
    for (let k = i; k < to; k++) if (text.charCodeAt(k) === 10) line++;
    i = to;
  };
  // A byte order mark is not text.
  if (text.charCodeAt(0) === 0xfeff) i = 1;
  while (i < text.length) {
    const lt = text.indexOf('<', i);
    if (lt < 0) {
      const rest = text.slice(i);
      if (stack.length) stack.at(-1)!.text += decode(rest, line);
      else if (rest.trim()) throw new XmlError('malformed', `line ${line}: text after the root element`);
      advance(text.length);
      break;
    }
    if (lt > i) {
      const t = text.slice(i, lt);
      if (stack.length) stack.at(-1)!.text += decode(t, line);
      else if (t.trim()) throw new XmlError('malformed', `line ${line}: text outside the root element`);
      advance(lt);
    }
    if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4);
      if (end < 0) throw new XmlError('malformed', `line ${line}: an unterminated comment`);
      advance(end + 3);
    } else if (text.startsWith('<![CDATA[', i)) {
      const end = text.indexOf(']]>', i + 9);
      if (end < 0) throw new XmlError('malformed', `line ${line}: an unterminated CDATA section`);
      if (!stack.length) throw new XmlError('malformed', `line ${line}: CDATA outside the root element`);
      stack.at(-1)!.text += text.slice(i + 9, end);
      advance(end + 3);
    } else if (text.startsWith('<!', i)) {
      // <!DOCTYPE …> and any other declaration: refused, so no entity is ever declared (C-15).
      throw new XmlError('dtd', `line ${line}: a document type declaration is not read`);
    } else if (text.startsWith('<?', i)) {
      const end = text.indexOf('?>', i + 2);
      if (end < 0) throw new XmlError('malformed', `line ${line}: an unterminated processing instruction`);
      advance(end + 2);
    } else if (text.startsWith('</', i)) {
      const end = text.indexOf('>', i + 2);
      if (end < 0) throw new XmlError('malformed', `line ${line}: an unterminated closing tag`);
      const name = text.slice(i + 2, end).trim();
      const open = stack.pop();
      if (!open || open.name !== name) throw new XmlError('malformed', `line ${line}: </${name}> closes ${open ? `<${open.name}>` : 'nothing'}`);
      advance(end + 1);
      if (!stack.length) root = open;
    } else {
      // A start tag: its name, its attributes, and whether it closes itself. Quoted values may hold `>`.
      let j = i + 1;
      const m = NAME.exec(text.slice(j, j + 512));
      if (!m) throw new XmlError('malformed', `line ${line}: an invalid tag`);
      const el: XmlElement = { name: m[0], attrs: {}, children: [], text: '', line };
      j += m[0].length;
      let selfClosing = false;
      for (;;) {
        while (j < text.length && /\s/.test(text[j]!)) j++;
        if (j >= text.length) throw new XmlError('malformed', `line ${line}: an unterminated tag <${el.name}>`);
        if (text.startsWith('/>', j)) {
          selfClosing = true;
          j += 2;
          break;
        }
        if (text[j] === '>') {
          j += 1;
          break;
        }
        const an = NAME.exec(text.slice(j, j + 512));
        if (!an) throw new XmlError('malformed', `line ${line}: an invalid attribute in <${el.name}>`);
        j += an[0].length;
        while (/\s/.test(text[j] ?? '')) j++;
        if (text[j] !== '=') throw new XmlError('malformed', `line ${line}: an attribute without a value in <${el.name}>`);
        j++;
        while (/\s/.test(text[j] ?? '')) j++;
        const q = text[j];
        if (q !== '"' && q !== "'") throw new XmlError('malformed', `line ${line}: an unquoted attribute in <${el.name}>`);
        const close = text.indexOf(q, j + 1);
        if (close < 0) throw new XmlError('malformed', `line ${line}: an unterminated attribute in <${el.name}>`);
        el.attrs[an[0]] = decode(text.slice(j + 1, close), line);
        j = close + 1;
      }
      if (stack.length) stack.at(-1)!.children.push(el);
      else if (root) throw new XmlError('malformed', `line ${line}: a second root element`);
      advance(j);
      if (selfClosing) {
        if (!stack.length) root = el;
      } else {
        stack.push(el);
        if (stack.length > maxDepth) throw new XmlError('too_deep', `nesting deeper than ${maxDepth} levels`);
      }
    }
  }
  if (stack.length) throw new XmlError('malformed', `line ${line}: <${stack.at(-1)!.name}> is never closed`);
  if (!root) throw new XmlError('malformed', 'no root element');
  return root;
}

/** Every descendant element with this name, in document order. */
export function descendants(el: XmlElement, name: string): XmlElement[] {
  const out: XmlElement[] = [];
  const walk = (e: XmlElement) => {
    for (const c of e.children) {
      if (c.name === name) out.push(c);
      walk(c);
    }
  };
  walk(el);
  return out;
}
