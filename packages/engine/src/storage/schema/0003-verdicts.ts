// Migration 3 (DEV-6): what the classifier (C-16) and the purity index (C-19) keep beyond 14.1 and migration 2.
//
// - findings: the tool's own rule beside AYAR's (14.2 «القاعدة»), and the finding's effect on the outcome
//   (violation, warning, review, note, or excluded by a review: D-35, never a silent exclusion).
// - check_runs: the counts of its findings by effect, and the reader (adapter or analyzer) with its version.
// - round_checks (C-19, D-31): what a round is made of, instance by instance — the execution whose outcome counts,
//   the outcome as merged when a round is continued (the retry replaces only an indecisive outcome; a conflict
//   between «اجتاز» and «أخفق», or a flaky one, follows the flaky policy), and every attempt kept as evidence.
// - runs.round_id (14.1) is now written: the round a full run made, or the round a continued run merged into.
// Only nullable columns are added to 14.1's tables.

export const VERDICTS_SCHEMA = /* sql */ `
ALTER TABLE findings ADD COLUMN tool_rule_id TEXT;
ALTER TABLE findings ADD COLUMN effect TEXT CHECK (effect IS NULL OR effect IN ('violation', 'warning', 'review', 'note', 'excluded'));

ALTER TABLE check_runs ADD COLUMN findings_json TEXT CHECK (findings_json IS NULL OR json_valid(findings_json));
ALTER TABLE check_runs ADD COLUMN reader_json TEXT CHECK (reader_json IS NULL OR json_valid(reader_json));

CREATE TABLE round_checks (
  round_id      TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  instance      TEXT NOT NULL,
  check_run_id  TEXT REFERENCES check_runs(id) ON DELETE SET NULL,
  outcome       TEXT,
  reviewed      INTEGER NOT NULL DEFAULT 0 CHECK (reviewed IN (0, 1)),
  attempts_json TEXT NOT NULL CHECK (json_valid(attempts_json)),
  PRIMARY KEY (round_id, instance)
) STRICT;
CREATE INDEX round_checks_check_run ON round_checks (check_run_id);

CREATE INDEX findings_check_run ON findings (check_run_id);
CREATE INDEX check_runs_instance ON check_runs (check_id, component);
CREATE INDEX rounds_project ON rounds (project_id, updated_at);
`;
