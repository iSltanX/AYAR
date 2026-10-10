// The engine's single C-18 instance: the catalog patterns (layer 2), the user's patterns from the settings
// (layer 4), and the values of sensitive environment variables C-07 registers (layer 1). Every component that
// receives text from outside (discovery facts, logs, reports) asks it for a Redactor before anything is saved.
import type { Catalog } from '@ayar/catalog';
import type { UserRedactionPattern } from '@ayar/protocol';
import { nameRules, type NameRules } from './names.ts';
import { compileRules, Redactor, type KnownValue } from './redactor.ts';

export class RedactionService {
  readonly #catalog: Catalog;
  #user: readonly UserRedactionPattern[] = [];
  #userNames: readonly string[] = [];
  readonly #known = new Map<string, KnownValue>();
  #redactor: Redactor | null = null;
  #names: NameRules | null = null;

  constructor(catalog: Catalog, user: readonly UserRedactionPattern[] = [], userNames: readonly string[] = []) {
    this.#catalog = catalog;
    this.#user = user;
    this.#userNames = userNames;
  }

  /** Layer 4 (value patterns) and the extra sensitive names, from the settings. */
  configure(user: readonly UserRedactionPattern[], userNames: readonly string[]): void {
    this.#user = user;
    this.#userNames = userNames;
    this.#redactor = null;
    this.#names = null;
  }

  /** Layer 1: values of sensitive variables (8 characters or more are kept by the redactor). */
  registerKnownValues(values: readonly KnownValue[]): void {
    let changed = false;
    for (const v of values) {
      const key = `${v.rule}\u0000${v.value}`;
      if (!this.#known.has(key)) {
        this.#known.set(key, v);
        changed = true;
      }
    }
    if (changed) this.#redactor = null;
  }

  redactor(): Redactor {
    this.#redactor ??= new Redactor(compileRules(this.#catalog.redaction, { user: this.#user, known: [...this.#known.values()] }));
    return this.#redactor;
  }

  /** The sensitive-name rules (the one list C-07 withholds by), with the user's extra names. */
  names(): NameRules {
    this.#names ??= nameRules(this.#catalog.redaction, this.#userNames);
    return this.#names;
  }
}
