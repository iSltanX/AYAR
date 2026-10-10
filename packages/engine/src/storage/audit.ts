// The audit log (14.1 audit_log): approvals, exports, imports, trust changes and deletions are recorded with
// their time, the actor and details. Details never carry secrets (they pass through C-18 like everything else).
import type { AuditAction } from '@ayar/protocol';
import type { Db } from './db.ts';

export function recordAudit(db: Db, e: { id: string; at: Date; action: AuditAction; projectId: string | null; details: Record<string, unknown>; actor?: 'user' | 'engine' }): void {
  db.run(
    'INSERT INTO audit_log (id, at, actor, action, project_id, details_json) VALUES (?, ?, ?, ?, ?, ?)',
    e.id,
    e.at.toISOString(),
    e.actor ?? 'user',
    e.action,
    e.projectId,
    JSON.stringify(e.details),
  );
}
