DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'source_groups_service_count_nonnegative') THEN
        ALTER TABLE ai_profiler.source_groups
            ADD CONSTRAINT source_groups_service_count_nonnegative CHECK (service_count >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'models_field_count_nonnegative') THEN
        ALTER TABLE ai_profiler.models
            ADD CONSTRAINT models_field_count_nonnegative CHECK (field_count >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'model_fields_number_nonnegative') THEN
        ALTER TABLE ai_profiler.model_fields
            ADD CONSTRAINT model_fields_number_nonnegative CHECK (field_no >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'process_steps_order_nonnegative') THEN
        ALTER TABLE ai_profiler.process_steps
            ADD CONSTRAINT process_steps_order_nonnegative CHECK (display_order >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'process_steps_stage_nonnegative') THEN
        ALTER TABLE ai_profiler.process_steps
            ADD CONSTRAINT process_steps_stage_nonnegative CHECK (stage IS NULL OR stage >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evidence_refs_line_nonnegative') THEN
        ALTER TABLE ai_profiler.evidence_refs
            ADD CONSTRAINT evidence_refs_line_nonnegative CHECK (line_no IS NULL OR line_no >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'artifacts_size_nonnegative') THEN
        ALTER TABLE ai_profiler.artifacts
            ADD CONSTRAINT artifacts_size_nonnegative CHECK (size_bytes >= 0);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS snapshots_imported_at_idx
    ON ai_profiler.snapshots(imported_at DESC);

CREATE INDEX IF NOT EXISTS report_imports_source_hash_idx
    ON ai_profiler.report_imports(source_hash, imported_at DESC);

CREATE INDEX IF NOT EXISTS contracts_quality_idx
    ON ai_profiler.contracts(snapshot_id, confirmed, quality_tier);

CREATE INDEX IF NOT EXISTS process_steps_service_idx
    ON ai_profiler.process_steps(snapshot_id, source_service, target_service);

CREATE INDEX IF NOT EXISTS evidence_refs_fact_idx
    ON ai_profiler.evidence_refs(snapshot_id, fact_id)
    WHERE fact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS artifacts_path_idx
    ON ai_profiler.artifacts(snapshot_id, relative_path);
