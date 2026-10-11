// Migration 5 (DEV-9): what the reports (C-21, C-23), the human reviews (C-16), the task lifecycle (C-20), the model
// checks (C-25) and the integrity checks (C-22) keep beyond 14.1 and migrations 2 to 4. Only nullable columns are
// added to 14.1's tables; one small table holds the inputs a user supplies for a model-check need (12.9 «ناقص:
// {المعلومة}» with its field), which is not a check run and not a card.
//
// - check_runs.tests_json: the test counts of the parsed report (total, passed, failed, skipped, flaky), so the
//   report («214 اختبارًا نجحت») and a card's verification («ازدياد عدد الاختبارات») read them without the evidence.
// - findings.from_claim_id: the model claim a finding was proven from (12.9: «مع الإشارة إلى الادعاء مصدرًا»).
// - reports.report_json: the `report/1` object itself, so exports and the clipboard regenerate from one source.
// - tasks: the verification record, the close reason, what the card follows, and its base (the test count and the
//   snapshot when it was made) for the four conditions of 12.8.
// - ai_checks and model_claims: the language, the inputs, the token, the facts hash (for «قديم»), the note's index
//   and text, and the finding a claim was proven by.

export const REPORTS_SCHEMA = /* sql */ `
ALTER TABLE check_runs ADD COLUMN tests_json TEXT CHECK (tests_json IS NULL OR json_valid(tests_json));

ALTER TABLE findings ADD COLUMN from_claim_id TEXT REFERENCES model_claims(id) ON DELETE SET NULL;

ALTER TABLE reports ADD COLUMN report_json TEXT CHECK (report_json IS NULL OR json_valid(report_json));
ALTER TABLE reports ADD COLUMN human_chars_by_section_json TEXT CHECK (human_chars_by_section_json IS NULL OR json_valid(human_chars_by_section_json));
ALTER TABLE reports ADD COLUMN blocked_reason TEXT;

ALTER TABLE tasks ADD COLUMN verification_json TEXT CHECK (verification_json IS NULL OR json_valid(verification_json));
ALTER TABLE tasks ADD COLUMN close_reason TEXT;
ALTER TABLE tasks ADD COLUMN follows TEXT;
ALTER TABLE tasks ADD COLUMN base_json TEXT CHECK (base_json IS NULL OR json_valid(base_json));

ALTER TABLE ai_checks ADD COLUMN lang TEXT CHECK (lang IS NULL OR lang IN ('ar', 'en'));
ALTER TABLE ai_checks ADD COLUMN inputs_json TEXT CHECK (inputs_json IS NULL OR json_valid(inputs_json));
ALTER TABLE ai_checks ADD COLUMN token TEXT;
ALTER TABLE ai_checks ADD COLUMN facts_hash TEXT;
ALTER TABLE ai_checks ADD COLUMN template_version TEXT;
ALTER TABLE ai_checks ADD COLUMN redaction_counts_json TEXT CHECK (redaction_counts_json IS NULL OR json_valid(redaction_counts_json));

ALTER TABLE model_claims ADD COLUMN note_index INTEGER;
ALTER TABLE model_claims ADD COLUMN summary_redacted TEXT;
ALTER TABLE model_claims ADD COLUMN proven_finding_id TEXT REFERENCES findings(id) ON DELETE SET NULL;
ALTER TABLE model_claims ADD COLUMN imported_at TEXT;

CREATE TABLE ai_need_inputs (
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (project_id, template_id, key)
) STRICT;

CREATE INDEX reports_project_created ON reports (project_id, created_at);
CREATE INDEX reviews_project_target ON reviews (project_id, target_type, target_ref);
CREATE INDEX model_claims_check ON model_claims (ai_check_id);
CREATE INDEX ai_checks_project ON ai_checks (project_id, template_id);
`;
