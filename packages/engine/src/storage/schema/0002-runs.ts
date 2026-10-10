// Migration 2 (DEV-5): what planning, running, setup and the evidence store need beyond 14.1.
//
// - plans (G-24): run.plan returns a plan id, and 14.1 has no table for it. A plan is kept with its selection,
//   the profile version and hash it was built on, and the discovery snapshot; it is frozen when a run starts
//   from it (frozen_at, run_id), so the same plan never starts twice and a run always names the plan it ran.
// - tool_version_acceptances (G-25): «اعتماد إصدار أداة خارج النطاق مرة» — the user accepted, once, a tool
//   version outside what the project asks for (a .nvmrc mismatch); readiness then counts it as ready, and says why.
// - New nullable columns only (14.1's columns are kept as named; the ledger's frozen columns untouched, G-27):
//   runs: the plan, the cancel reason and the sleep request; check_runs: the raw result and its notes;
//   snapshots: their purpose, the volume's file-system type and whether the E-25 shortcut was used;
//   process_ledger: what a row is (a check, a companion service, a setup action) and its run; setup_actions: the
//   state, target and log of an action (its log lives in logs/, since evidence rows belong to check runs).
// - snapshot_refs (C-17 «مجمّع مخلفات بعدّ المراجع»): which content blobs each state snapshot references, so the
//   reference count of snapshot_blobs is exact whatever deletes a snapshot (a run, a project, retention).

export const RUNS_SCHEMA = /* sql */ `
CREATE TABLE plans (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL,
  selection_json   TEXT NOT NULL CHECK (json_valid(selection_json)),
  plan_json        TEXT NOT NULL CHECK (json_valid(plan_json)),
  profile_version  INTEGER NOT NULL,
  profile_hash     TEXT NOT NULL,
  snapshot_id      TEXT REFERENCES discovery_snapshots(id) ON DELETE SET NULL,
  spec_inputs_json TEXT CHECK (spec_inputs_json IS NULL OR json_valid(spec_inputs_json)),
  created_at       TEXT NOT NULL,
  frozen_at        TEXT,
  run_id           TEXT REFERENCES runs(id) ON DELETE SET NULL
) STRICT;
CREATE INDEX plans_project_created ON plans (project_id, created_at);

CREATE TABLE tool_version_acceptances (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tool          TEXT NOT NULL,
  required_spec TEXT NOT NULL,
  required_from TEXT,
  version       TEXT NOT NULL,
  path          TEXT,
  accepted_at   TEXT NOT NULL,
  UNIQUE (project_id, tool, required_spec, version)
) STRICT;

CREATE TABLE snapshot_refs (
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  sha256      TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, sha256)
) STRICT;
CREATE INDEX snapshot_refs_sha ON snapshot_refs (sha256);

ALTER TABLE runs ADD COLUMN plan_id TEXT;
ALTER TABLE runs ADD COLUMN cancel_reason TEXT;
ALTER TABLE runs ADD COLUMN prevent_sleep INTEGER;
ALTER TABLE runs ADD COLUMN state_changed INTEGER;

ALTER TABLE check_runs ADD COLUMN raw_json TEXT CHECK (raw_json IS NULL OR json_valid(raw_json));
ALTER TABLE check_runs ADD COLUMN notes_json TEXT CHECK (notes_json IS NULL OR json_valid(notes_json));

ALTER TABLE snapshots ADD COLUMN purpose TEXT;
ALTER TABLE snapshots ADD COLUMN fs_type TEXT;
ALTER TABLE snapshots ADD COLUMN fast_path INTEGER;
ALTER TABLE snapshots ADD COLUMN content_stored INTEGER;

ALTER TABLE process_ledger ADD COLUMN kind TEXT;
ALTER TABLE process_ledger ADD COLUMN run_id TEXT;

ALTER TABLE setup_actions ADD COLUMN state TEXT;
ALTER TABLE setup_actions ADD COLUMN target_json TEXT CHECK (target_json IS NULL OR json_valid(target_json));
ALTER TABLE setup_actions ADD COLUMN instances_json TEXT CHECK (instances_json IS NULL OR json_valid(instances_json));
ALTER TABLE setup_actions ADD COLUMN reasons_json TEXT CHECK (reasons_json IS NULL OR json_valid(reasons_json));
ALTER TABLE setup_actions ADD COLUMN log_path TEXT;
ALTER TABLE setup_actions ADD COLUMN log_sha256 TEXT;

-- Whether the install checked the publisher's signature (1), or stood on the pinned hash alone (0, sigstore
-- without cosign); NULL where the tool has no signature to check.
ALTER TABLE tools ADD COLUMN signature_checked INTEGER;

CREATE INDEX evidence_check_run ON evidence (check_run_id);
CREATE INDEX check_runs_previous ON check_runs (previous_check_run_id);
CREATE INDEX snapshots_project ON snapshots (project_id, created_at);
`;
