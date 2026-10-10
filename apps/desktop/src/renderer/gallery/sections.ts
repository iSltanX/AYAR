// Gallery sections are discovered from ./sections/*.svelte; each exports `meta` from its module script.
import type { Component } from 'svelte';

export interface SectionMeta {
  /** The Figma documentation frame, e.g. "C-0B" or "S-01". */
  id: string;
  title: string;
  /** The approved Figma frame node id (docs/design/README.md §7). */
  figma: string;
  order: number;
}

interface SectionModule {
  default: Component;
  meta: SectionMeta;
}

const modules = import.meta.glob<SectionModule>('./sections/*.svelte', { eager: true });

export const SECTIONS = Object.values(modules)
  .map((m) => ({ ...m.meta, component: m.default }))
  .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
