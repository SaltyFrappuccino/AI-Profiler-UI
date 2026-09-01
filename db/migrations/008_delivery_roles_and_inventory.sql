REVOKE CREATE ON SCHEMA ai_profiler FROM PUBLIC;

GRANT USAGE ON SCHEMA ai_profiler TO ai_profiler_ui;
GRANT SELECT ON ALL TABLES IN SCHEMA ai_profiler TO ai_profiler_ui;
ALTER DEFAULT PRIVILEGES IN SCHEMA ai_profiler
    GRANT SELECT ON TABLES TO ai_profiler_ui;

CREATE OR REPLACE VIEW ai_profiler.snapshot_inventory AS
SELECT
    snapshots.snapshot_id,
    snapshots.name,
    snapshots.source_hash,
    snapshots.source_file,
    snapshots.report_schema_version,
    snapshots.imported_at,
    (SELECT count(*)::integer FROM ai_profiler.services WHERE services.snapshot_id = snapshots.snapshot_id) AS service_count,
    (SELECT count(*)::integer FROM ai_profiler.contracts WHERE contracts.snapshot_id = snapshots.snapshot_id) AS contract_count,
    (SELECT count(*)::integer FROM ai_profiler.processes WHERE processes.snapshot_id = snapshots.snapshot_id) AS process_count,
    (SELECT count(*)::integer FROM ai_profiler.process_steps WHERE process_steps.snapshot_id = snapshots.snapshot_id) AS process_step_count,
    (SELECT count(*)::integer FROM ai_profiler.models WHERE models.snapshot_id = snapshots.snapshot_id) AS model_count,
    (SELECT count(*)::integer FROM ai_profiler.model_fields WHERE model_fields.snapshot_id = snapshots.snapshot_id) AS model_field_count,
    (SELECT count(*)::integer FROM ai_profiler.field_links WHERE field_links.snapshot_id = snapshots.snapshot_id) AS field_link_count,
    (SELECT count(*)::integer FROM ai_profiler.evidence_refs WHERE evidence_refs.snapshot_id = snapshots.snapshot_id) AS evidence_ref_count,
    (SELECT count(*)::integer FROM ai_profiler.artifacts WHERE artifacts.snapshot_id = snapshots.snapshot_id) AS artifact_count
FROM ai_profiler.snapshots;

GRANT SELECT ON ai_profiler.snapshot_inventory TO ai_profiler_ui;
