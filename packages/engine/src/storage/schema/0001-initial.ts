// Migration 1: the full schema of plan 14.1, every table with its essential columns as named there.
// Conventions: STRICT tables; ids are TEXT (internal keys never shown to the user, 14.2); times are ISO 8601
// UTC TEXT; booleans are INTEGER 0/1; composite fields are JSON TEXT checked with json_valid() here and
// against a schema before writing (14.1). CHECK constraints only where the plan fixes the vocabulary
// (severity, proof, origin, cross-run status, report target, language): SQLite cannot alter a CHECK later,
// so states whose vocabulary DEV-5/DEV-6 define (run and check states, outcomes) stay unconstrained here.
//
// G-27: process_ledger is read at boot BEFORE migrations run. Its columns id, pid, pgid, os_start_time,
// check_token, temp_dir, state and ended_at are frozen: later migrations may add nullable columns to it, never
// rename, retype or drop these (ledger.ts reads only them; a test guards it). It has no foreign key, so a
// ledger row survives whatever happens to the run it belongs to.

export const INITIAL_SCHEMA = /* sql */ `
CREATE TABLE schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

CREATE TABLE projects (
  id             TEXT PRIMARY KEY,
  display_name   TEXT NOT NULL,
  root_path      TEXT NOT NULL,
  root_realpath  TEXT NOT NULL UNIQUE,
  trusted        INTEGER NOT NULL DEFAULT 0 CHECK (trusted IN (0, 1)),
  created_at     TEXT NOT NULL,
  last_opened_at TEXT
) STRICT;

CREATE TABLE discovery_snapshots (
  id                     TEXT PRIMARY KEY,
  project_id             TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at             TEXT NOT NULL,
  scanner_version        TEXT NOT NULL,
  partial                INTEGER NOT NULL CHECK (partial IN (0, 1)),
  facts_json             TEXT NOT NULL CHECK (json_valid(facts_json)),
  inventory_json         TEXT NOT NULL CHECK (json_valid(inventory_json)),
  warnings_json          TEXT NOT NULL CHECK (json_valid(warnings_json)),
  spec_fingerprints_json TEXT NOT NULL CHECK (json_valid(spec_fingerprints_json))
) STRICT;

CREATE TABLE profiles (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version      INTEGER NOT NULL,
  content_json TEXT NOT NULL CHECK (json_valid(content_json)),
  content_hash TEXT NOT NULL,
  source       TEXT NOT NULL CHECK (source IN ('proposed', 'edited', 'imported')),
  created_at   TEXT NOT NULL,
  UNIQUE (project_id, version)
) STRICT;

CREATE TABLE approvals (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  check_id        TEXT NOT NULL,
  component       TEXT NOT NULL,
  spec_hash       TEXT NOT NULL,
  profile_version INTEGER NOT NULL,
  approved_at     TEXT NOT NULL,
  note            TEXT,
  UNIQUE (project_id, check_id, component)
) STRICT;

CREATE TABLE catalog_meta (
  version   TEXT PRIMARY KEY,
  hash      TEXT NOT NULL,
  loaded_at TEXT NOT NULL
) STRICT;

CREATE TABLE tools (
  id           TEXT PRIMARY KEY,
  tool_key     TEXT NOT NULL,
  version      TEXT NOT NULL,
  source       TEXT NOT NULL,
  path         TEXT,
  sha256       TEXT,
  license      TEXT,
  installed_at TEXT,
  verified_at  TEXT,
  status       TEXT NOT NULL,
  UNIQUE (tool_key, version)
) STRICT;

CREATE TABLE data_assets (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL,
  key             TEXT NOT NULL,
  version_or_date TEXT NOT NULL,
  path            TEXT NOT NULL,
  size            INTEGER,
  updated_at      TEXT NOT NULL,
  UNIQUE (kind, key)
) STRICT;

CREATE TABLE snapshots (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  manifest_blob_sha TEXT NOT NULL,
  file_count        INTEGER NOT NULL,
  total_size        INTEGER NOT NULL,
  hash              TEXT NOT NULL,
  created_at        TEXT NOT NULL
) STRICT;

CREATE TABLE snapshot_blobs (
  sha256          TEXT PRIMARY KEY,
  size            INTEGER NOT NULL,
  compressed_size INTEGER NOT NULL,
  refcount        INTEGER NOT NULL DEFAULT 0 CHECK (refcount >= 0)
) STRICT;

CREATE TABLE rounds (
  id          TEXT PRIMARY KEY,
  display_id  TEXT NOT NULL,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  base_run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
  snapshot_id TEXT REFERENCES snapshots(id) ON DELETE SET NULL,
  verdict     TEXT,
  purity_json TEXT CHECK (purity_json IS NULL OR json_valid(purity_json)),
  updated_at  TEXT NOT NULL,
  UNIQUE (project_id, display_id)
) STRICT;

CREATE TABLE runs (
  id                TEXT PRIMARY KEY,
  display_id        TEXT NOT NULL,
  project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  round_id          TEXT REFERENCES rounds(id) ON DELETE SET NULL,
  kind              TEXT NOT NULL,
  selection_json    TEXT NOT NULL CHECK (json_valid(selection_json)),
  plan_json         TEXT NOT NULL CHECK (json_valid(plan_json)),
  profile_version   INTEGER,
  profile_hash      TEXT,
  catalog_version   TEXT,
  purity_formula    TEXT,
  state             TEXT NOT NULL,
  started_at        TEXT,
  finished_at       TEXT,
  snapshot_start_id TEXT REFERENCES snapshots(id) ON DELETE SET NULL,
  snapshot_end_id   TEXT REFERENCES snapshots(id) ON DELETE SET NULL,
  env_json          TEXT CHECK (env_json IS NULL OR json_valid(env_json)),
  git_json          TEXT CHECK (git_json IS NULL OR json_valid(git_json)),
  counts_json       TEXT CHECK (counts_json IS NULL OR json_valid(counts_json)),
  verdict           TEXT,
  purity_json       TEXT CHECK (purity_json IS NULL OR json_valid(purity_json)),
  keep_forever      INTEGER NOT NULL DEFAULT 0 CHECK (keep_forever IN (0, 1)),
  UNIQUE (project_id, display_id)
) STRICT;

CREATE TABLE reviews (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target_type  TEXT NOT NULL CHECK (target_type IN ('check', 'finding', 'model_claim')),
  target_ref   TEXT NOT NULL,
  decision     TEXT NOT NULL,
  scope_json   TEXT NOT NULL CHECK (json_valid(scope_json)),
  note         TEXT,
  snapshot_id  TEXT REFERENCES snapshots(id) ON DELETE SET NULL,
  expires_rule TEXT,
  created_at   TEXT NOT NULL
) STRICT;

CREATE TABLE check_runs (
  id                      TEXT PRIMARY KEY,
  run_id                  TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  check_id                TEXT NOT NULL,
  check_version           TEXT,
  section                 TEXT,
  criterion               TEXT,
  readiness               TEXT,
  readiness_reason        TEXT,
  component               TEXT NOT NULL,
  state                   TEXT NOT NULL,
  outcome                 TEXT,
  outcome_reason          TEXT,
  auto_outcome            TEXT,
  review_id               TEXT REFERENCES reviews(id) ON DELETE SET NULL,
  covered_by_check_run_id TEXT REFERENCES check_runs(id) ON DELETE SET NULL,
  shared_invocation_key   TEXT,
  origin                  TEXT CHECK (origin IS NULL OR origin IN ('project', 'tool', 'environment', 'model')),
  started_at              TEXT,
  finished_at             TEXT,
  duration_ms             INTEGER,
  exit_code               INTEGER,
  signal                  TEXT,
  command_json            TEXT CHECK (command_json IS NULL OR json_valid(command_json)),
  cwd_rel                 TEXT,
  env_keys_json           TEXT CHECK (env_keys_json IS NULL OR json_valid(env_keys_json)),
  tool_versions_json      TEXT CHECK (tool_versions_json IS NULL OR json_valid(tool_versions_json)),
  attempt                 INTEGER NOT NULL DEFAULT 1,
  previous_check_run_id   TEXT REFERENCES check_runs(id) ON DELETE SET NULL,
  resource_json           TEXT CHECK (resource_json IS NULL OR json_valid(resource_json)),
  last_activity_at        TEXT,
  sleep_gaps_json         TEXT CHECK (sleep_gaps_json IS NULL OR json_valid(sleep_gaps_json))
) STRICT;

CREATE TABLE findings (
  id                 TEXT PRIMARY KEY,
  check_run_id       TEXT NOT NULL REFERENCES check_runs(id) ON DELETE CASCADE,
  fingerprint        TEXT NOT NULL,
  display_id         TEXT NOT NULL,
  check_id           TEXT NOT NULL,
  component          TEXT NOT NULL,
  rule_id            TEXT,
  rule_version       TEXT,
  severity           TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  proof              TEXT NOT NULL CHECK (proof IN ('proven', 'suspected', 'suggestion')),
  origin             TEXT NOT NULL CHECK (origin IN ('project', 'tool', 'environment', 'model')),
  title_key          TEXT NOT NULL,
  message_redacted   TEXT,
  location_json      TEXT CHECK (location_json IS NULL OR json_valid(location_json)),
  expected_text      TEXT,
  actual_text        TEXT,
  evidence_ids_json  TEXT CHECK (evidence_ids_json IS NULL OR json_valid(evidence_ids_json)),
  first_seen_run_id  TEXT REFERENCES runs(id) ON DELETE SET NULL,
  cross_run_status   TEXT CHECK (cross_run_status IS NULL OR cross_run_status IN ('new', 'persisting', 'resolved', 'reappeared')),
  review_id          TEXT REFERENCES reviews(id) ON DELETE SET NULL
) STRICT;

CREATE TABLE evidence (
  id                    TEXT PRIMARY KEY,
  check_run_id          TEXT NOT NULL REFERENCES check_runs(id) ON DELETE CASCADE,
  kind                  TEXT NOT NULL,
  rel_path              TEXT NOT NULL,
  sha256                TEXT NOT NULL,
  size                  INTEGER NOT NULL,
  redacted              INTEGER NOT NULL DEFAULT 0 CHECK (redacted IN (0, 1)),
  redaction_counts_json TEXT CHECK (redaction_counts_json IS NULL OR json_valid(redaction_counts_json)),
  truncated             INTEGER NOT NULL DEFAULT 0 CHECK (truncated IN (0, 1)),
  created_at            TEXT NOT NULL
) STRICT;

CREATE TABLE baselines (
  id                         TEXT PRIMARY KEY,
  project_id                 TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key_json                   TEXT NOT NULL CHECK (json_valid(key_json)),
  rel_path                   TEXT NOT NULL,
  sha256                     TEXT NOT NULL,
  approved_at                TEXT NOT NULL,
  approved_from_check_run_id TEXT REFERENCES check_runs(id) ON DELETE SET NULL,
  status                     TEXT NOT NULL
) STRICT;

CREATE TABLE tasks (
  id                 TEXT PRIMARY KEY,
  display_id         TEXT NOT NULL,
  project_id         TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind               TEXT NOT NULL,
  title              TEXT NOT NULL,
  body_json          TEXT NOT NULL CHECK (json_valid(body_json)),
  priority           TEXT,
  source_json        TEXT CHECK (source_json IS NULL OR json_valid(source_json)),
  status             TEXT NOT NULL,
  verified_by_run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  UNIQUE (project_id, display_id)
) STRICT;

CREATE TABLE reports (
  id                    TEXT PRIMARY KEY,
  display_id            TEXT NOT NULL,
  project_id            TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  run_id                TEXT REFERENCES runs(id) ON DELETE SET NULL,
  target_kind           TEXT NOT NULL CHECK (target_kind IN ('run', 'findings', 'card')),
  finding_ids_json      TEXT CHECK (finding_ids_json IS NULL OR json_valid(finding_ids_json)),
  lang                  TEXT NOT NULL CHECK (lang IN ('ar', 'en')),
  template_version      TEXT NOT NULL,
  model_text_redacted   TEXT,
  human_chars           INTEGER,
  model_chars           INTEGER,
  redaction_counts_json TEXT CHECK (redaction_counts_json IS NULL OR json_valid(redaction_counts_json)),
  parity_ok             INTEGER CHECK (parity_ok IS NULL OR parity_ok IN (0, 1)),
  copied_at             TEXT,
  created_at            TEXT NOT NULL
) STRICT;

CREATE TABLE ai_checks (
  id               TEXT PRIMARY KEY,
  display_id       TEXT NOT NULL,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template_id      TEXT NOT NULL,
  status           TEXT NOT NULL,
  need_json        TEXT CHECK (need_json IS NULL OR json_valid(need_json)),
  instruction_text TEXT,
  instruction_hash TEXT,
  generated_at     TEXT,
  saved_path       TEXT,
  result_path      TEXT,
  result_hash      TEXT,
  imported_at      TEXT,
  reject_reason    TEXT,
  UNIQUE (project_id, display_id)
) STRICT;

CREATE TABLE model_claims (
  id                      TEXT PRIMARY KEY,
  display_id              TEXT NOT NULL,
  ai_check_id             TEXT NOT NULL REFERENCES ai_checks(id) ON DELETE CASCADE,
  location_json           TEXT CHECK (location_json IS NULL OR json_valid(location_json)),
  kind                    TEXT,
  severity_suggested      TEXT CHECK (severity_suggested IS NULL OR severity_suggested IN ('critical', 'high', 'medium', 'low', 'info')),
  evidence_quote_redacted TEXT,
  matched_check_id        TEXT,
  match_status            TEXT,
  review_id               TEXT REFERENCES reviews(id) ON DELETE SET NULL
) STRICT;

CREATE TABLE process_ledger (
  id             TEXT PRIMARY KEY,
  check_run_id   TEXT,
  pid            INTEGER NOT NULL,
  pgid           INTEGER NOT NULL,
  os_start_time  TEXT NOT NULL,
  command_digest TEXT NOT NULL,
  check_token    TEXT NOT NULL,
  temp_dir       TEXT,
  state          TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  ended_at       TEXT
) STRICT;

CREATE TABLE setup_actions (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,
  preview_json    TEXT NOT NULL CHECK (json_valid(preview_json)),
  confirmed_at    TEXT,
  started_at      TEXT,
  finished_at     TEXT,
  result          TEXT,
  log_evidence_id TEXT REFERENCES evidence(id) ON DELETE SET NULL
) STRICT;

CREATE TABLE finding_ids (
  project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  fingerprint       TEXT NOT NULL,
  display_id        TEXT NOT NULL,
  first_seen_run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
  PRIMARY KEY (project_id, fingerprint),
  UNIQUE (project_id, display_id)
) STRICT;

CREATE TABLE saved_groups (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  instance_keys_json TEXT NOT NULL CHECK (json_valid(instance_keys_json)),
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  UNIQUE (project_id, name)
) STRICT;

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value_json TEXT NOT NULL CHECK (json_valid(value_json))
) STRICT;

CREATE TABLE audit_log (
  id           TEXT PRIMARY KEY,
  at           TEXT NOT NULL,
  actor        TEXT NOT NULL,
  action       TEXT NOT NULL,
  project_id   TEXT REFERENCES projects(id) ON DELETE SET NULL,
  details_json TEXT CHECK (details_json IS NULL OR json_valid(details_json))
) STRICT;

-- 14.1 indexes, plus the foreign keys the boot and the ledger read.
CREATE INDEX runs_project_started ON runs (project_id, started_at);
CREATE INDEX check_runs_run ON check_runs (run_id);
CREATE INDEX findings_fingerprint ON findings (fingerprint);
CREATE INDEX tasks_project_status ON tasks (project_id, status);
CREATE INDEX check_runs_state ON check_runs (state);
CREATE INDEX runs_state ON runs (state);
CREATE INDEX process_ledger_state ON process_ledger (state);
CREATE INDEX audit_log_at ON audit_log (at);
`;
