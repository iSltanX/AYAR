// Kept task cards (C-20, C-17 `tasks`): task.create generates the card from its source and stores it «مفتوحة»
// with the next display id TASK-NNNN of the project (D-36); tasks.list returns them. The lifecycle (copied,
// awaiting verification, verified, closed with a reason) and its verification belong to DEV-9.
import type { Catalog } from '@ayar/catalog';
import { TaskCard, TaskStatus, type TaskRecord, type TaskSource } from '@ayar/protocol';
import type { AdvisorFacts } from '../advisor/context.ts';
import { newId } from '../host/ids.ts';
import type { EnginePorts, Logger } from '../ports/index.ts';
import type { Db } from '../storage/db.ts';
import { generateCard, renderCard, type CardProjectContext } from './cards.ts';

interface Row {
  id: string;
  display_id: string;
  project_id: string;
  body_json: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface TasksServiceOptions {
  db: Db;
  catalog: Catalog;
  ports: EnginePorts;
  logger?: Logger;
}

const DISPLAY = /^TASK-(\d+)$/;

export class TasksService {
  readonly #o: TasksServiceOptions;
  constructor(o: TasksServiceOptions) {
    this.#o = o;
  }

  create(projectId: string, source: TaskSource, facts: AdvisorFacts, project: CardProjectContext): TaskRecord {
    const card = generateCard(source, this.#o.catalog, facts, project);
    const now = this.#o.ports.clock.now().toISOString();
    const id = newId(this.#o.ports.random, 'task');
    return this.#o.db.transaction(() => {
      const last = this.#o.db
        .all<{ display_id: string }>('SELECT display_id FROM tasks WHERE project_id = ?', projectId)
        .map((r) => Number(DISPLAY.exec(r.display_id)?.[1] ?? 0))
        .reduce((a, b) => Math.max(a, b), 0);
      const displayId = `TASK-${String(last + 1).padStart(4, '0')}`;
      const kept: TaskCard = { ...card, text: renderCard(card, this.#o.catalog.kb, displayId) };
      this.#o.db.run(
        'INSERT INTO tasks (id, display_id, project_id, kind, title, body_json, priority, source_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id,
        displayId,
        projectId,
        kept.type,
        kept.name,
        JSON.stringify(kept),
        String(kept.priority),
        JSON.stringify(source),
        'open',
        now,
        now,
      );
      return { id, displayId, projectId, status: 'open', card: kept, createdAt: now, updatedAt: now };
    });
  }

  list(projectId: string): TaskRecord[] {
    const rows = this.#o.db.all<Row>('SELECT id, display_id, project_id, body_json, status, created_at, updated_at FROM tasks WHERE project_id = ? ORDER BY created_at, length(display_id), display_id', projectId);
    const out: TaskRecord[] = [];
    for (const r of rows) {
      // One unreadable row (damaged, or written by another card version) never hides the others (review m7).
      let body: unknown = null;
      try {
        body = JSON.parse(r.body_json);
      } catch {
        body = null;
      }
      const card = TaskCard.safeParse(body);
      const status = TaskStatus.safeParse(r.status);
      if (!card.success || !status.success) {
        this.#o.logger?.log('warn', 'task row skipped: unreadable card', { displayId: r.display_id });
        continue;
      }
      out.push({ id: r.id, displayId: r.display_id, projectId: r.project_id, status: status.data, card: card.data, createdAt: r.created_at, updatedAt: r.updated_at });
    }
    return out;
  }
}
