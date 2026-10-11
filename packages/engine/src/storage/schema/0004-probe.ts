// Migration 4 (DEV-7): what the reference images of C-14 keep beyond 14.1's `baselines` row — the state snapshot of
// the run they were approved on (C-17), so a later difference can name the source lines that changed since (and
// retention keeps that snapshot while a reference names it). Only a nullable column and an index are added.

export const PROBE_SCHEMA = /* sql */ `
ALTER TABLE baselines ADD COLUMN snapshot_id TEXT REFERENCES snapshots(id) ON DELETE SET NULL;
CREATE INDEX baselines_project ON baselines (project_id, status);
`;
