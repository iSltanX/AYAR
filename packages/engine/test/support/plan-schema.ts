// Plan 14.1, transcribed table by table: the columns the schema must have, no more and no less.
export const PLAN_TABLES: Record<string, string[]> = {
  schema_meta: ['key', 'value'],
  projects: ['id', 'display_name', 'root_path', 'root_realpath', 'trusted', 'created_at', 'last_opened_at'],
  discovery_snapshots: ['id', 'project_id', 'created_at', 'scanner_version', 'partial', 'facts_json', 'inventory_json', 'warnings_json', 'spec_fingerprints_json'],
  profiles: ['id', 'project_id', 'version', 'content_json', 'content_hash', 'source', 'created_at'],
  approvals: ['id', 'project_id', 'check_id', 'component', 'spec_hash', 'profile_version', 'approved_at', 'note'],
  catalog_meta: ['version', 'hash', 'loaded_at'],
  tools: ['id', 'tool_key', 'version', 'source', 'path', 'sha256', 'license', 'installed_at', 'verified_at', 'status'],
  data_assets: ['id', 'kind', 'key', 'version_or_date', 'path', 'size', 'updated_at'],
  runs: ['id', 'display_id', 'project_id', 'round_id', 'kind', 'selection_json', 'plan_json', 'profile_version', 'profile_hash', 'catalog_version', 'purity_formula', 'state', 'started_at', 'finished_at', 'snapshot_start_id', 'snapshot_end_id', 'env_json', 'git_json', 'counts_json', 'verdict', 'purity_json', 'keep_forever'],
  rounds: ['id', 'display_id', 'project_id', 'base_run_id', 'snapshot_id', 'verdict', 'purity_json', 'updated_at'],
  check_runs: ['id', 'run_id', 'check_id', 'check_version', 'section', 'criterion', 'readiness', 'readiness_reason', 'component', 'state', 'outcome', 'outcome_reason', 'auto_outcome', 'review_id', 'covered_by_check_run_id', 'shared_invocation_key', 'origin', 'started_at', 'finished_at', 'duration_ms', 'exit_code', 'signal', 'command_json', 'cwd_rel', 'env_keys_json', 'tool_versions_json', 'attempt', 'previous_check_run_id', 'resource_json', 'last_activity_at', 'sleep_gaps_json'],
  findings: ['id', 'check_run_id', 'fingerprint', 'display_id', 'check_id', 'component', 'rule_id', 'rule_version', 'severity', 'proof', 'origin', 'title_key', 'message_redacted', 'location_json', 'expected_text', 'actual_text', 'evidence_ids_json', 'first_seen_run_id', 'cross_run_status', 'review_id'],
  evidence: ['id', 'check_run_id', 'kind', 'rel_path', 'sha256', 'size', 'redacted', 'redaction_counts_json', 'truncated', 'created_at'],
  reviews: ['id', 'project_id', 'target_type', 'target_ref', 'decision', 'scope_json', 'note', 'snapshot_id', 'expires_rule', 'created_at'],
  baselines: ['id', 'project_id', 'key_json', 'rel_path', 'sha256', 'approved_at', 'approved_from_check_run_id', 'status'],
  tasks: ['id', 'display_id', 'project_id', 'kind', 'title', 'body_json', 'priority', 'source_json', 'status', 'verified_by_run_id', 'created_at', 'updated_at'],
  reports: ['id', 'display_id', 'project_id', 'run_id', 'target_kind', 'finding_ids_json', 'lang', 'template_version', 'model_text_redacted', 'human_chars', 'model_chars', 'redaction_counts_json', 'parity_ok', 'copied_at', 'created_at'],
  ai_checks: ['id', 'display_id', 'project_id', 'template_id', 'status', 'need_json', 'instruction_text', 'instruction_hash', 'generated_at', 'saved_path', 'result_path', 'result_hash', 'imported_at', 'reject_reason'],
  model_claims: ['id', 'display_id', 'ai_check_id', 'location_json', 'kind', 'severity_suggested', 'evidence_quote_redacted', 'matched_check_id', 'match_status', 'review_id'],
  snapshots: ['id', 'project_id', 'manifest_blob_sha', 'file_count', 'total_size', 'hash', 'created_at'],
  snapshot_blobs: ['sha256', 'size', 'compressed_size', 'refcount'],
  process_ledger: ['id', 'check_run_id', 'pid', 'pgid', 'os_start_time', 'command_digest', 'check_token', 'temp_dir', 'state', 'created_at', 'ended_at'],
  setup_actions: ['id', 'project_id', 'kind', 'preview_json', 'confirmed_at', 'started_at', 'finished_at', 'result', 'log_evidence_id'],
  finding_ids: ['project_id', 'fingerprint', 'display_id', 'first_seen_run_id'],
  saved_groups: ['id', 'project_id', 'name', 'instance_keys_json', 'created_at', 'updated_at'],
  settings: ['key', 'value_json'],
  audit_log: ['id', 'at', 'actor', 'action', 'project_id', 'details_json'],
};

/** 14.1 «الفهارس». */
export const PLAN_INDEXES: [string, string[]][] = [
  ['runs', ['project_id', 'started_at']],
  ['check_runs', ['run_id']],
  ['findings', ['fingerprint']],
  ['tasks', ['project_id', 'status']],
];
