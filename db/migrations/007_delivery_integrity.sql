ALTER TABLE ai_profiler.artifacts
    DROP CONSTRAINT IF EXISTS artifacts_relative_path_safe;

ALTER TABLE ai_profiler.artifacts
    ADD CONSTRAINT artifacts_relative_path_safe
    CHECK (
        relative_path !~ '(^/|^[A-Za-z]:|(^|/)\.\.(/|$))'
        AND position(chr(92) IN relative_path) = 0
    );

CREATE UNIQUE INDEX IF NOT EXISTS artifacts_relative_path_unique_idx
    ON ai_profiler.artifacts(snapshot_id, relative_path);
