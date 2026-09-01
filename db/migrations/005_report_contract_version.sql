ALTER TABLE ai_profiler.snapshots
    ADD COLUMN IF NOT EXISTS report_schema_version text;

UPDATE ai_profiler.snapshots
SET report_schema_version = COALESCE(
    NULLIF(document ->> 'schemaVersion', ''),
    'legacy.unversioned'
)
WHERE report_schema_version IS NULL;

ALTER TABLE ai_profiler.snapshots
    ALTER COLUMN report_schema_version SET NOT NULL;

ALTER TABLE ai_profiler.report_imports
    ADD COLUMN IF NOT EXISTS report_schema_version text;

UPDATE ai_profiler.report_imports AS report_imports
SET report_schema_version = snapshots.report_schema_version
FROM ai_profiler.snapshots AS snapshots
WHERE report_imports.snapshot_id = snapshots.snapshot_id
  AND report_imports.report_schema_version IS NULL;

ALTER TABLE ai_profiler.report_imports
    ALTER COLUMN report_schema_version SET NOT NULL;

CREATE INDEX IF NOT EXISTS snapshots_report_schema_version_idx
    ON ai_profiler.snapshots(report_schema_version, imported_at DESC);
