CREATE INDEX IF NOT EXISTS field_links_downstream_confirmed_idx
    ON ai_profiler.field_links(snapshot_id, source_service, field_name)
    WHERE confirmed;

CREATE INDEX IF NOT EXISTS field_links_upstream_confirmed_idx
    ON ai_profiler.field_links(snapshot_id, target_service, field_name)
    WHERE confirmed;

CREATE INDEX IF NOT EXISTS processes_entry_service_idx
    ON ai_profiler.processes(snapshot_id, entry_service)
    WHERE entry_service IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'artifacts_relative_path_safe'
          AND conrelid = 'ai_profiler.artifacts'::regclass
    ) THEN
        ALTER TABLE ai_profiler.artifacts
            ADD CONSTRAINT artifacts_relative_path_safe
            CHECK (
                relative_path !~ '(^/|^[A-Za-z]:|(^|/)\.\.(/|$))'
            );
    END IF;
END $$;
