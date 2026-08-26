CREATE SCHEMA IF NOT EXISTS ai_profiler;

CREATE TABLE IF NOT EXISTS ai_profiler.schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_profiler.snapshots (
    snapshot_id text PRIMARY KEY,
    name text NOT NULL,
    source_hash text NOT NULL,
    source_file text NOT NULL,
    imported_at timestamptz NOT NULL DEFAULT now(),
    summary jsonb NOT NULL,
    sequence_document jsonb NOT NULL,
    document jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_profiler.services (
    snapshot_id text NOT NULL REFERENCES ai_profiler.snapshots(snapshot_id) ON DELETE CASCADE,
    service_id text NOT NULL,
    source_group text,
    payload jsonb NOT NULL,
    PRIMARY KEY (snapshot_id, service_id)
);

CREATE TABLE IF NOT EXISTS ai_profiler.contracts (
    snapshot_id text NOT NULL REFERENCES ai_profiler.snapshots(snapshot_id) ON DELETE CASCADE,
    contract_id text NOT NULL,
    source_service text,
    target_service text,
    proof_level text,
    confirmed boolean NOT NULL DEFAULT false,
    payload jsonb NOT NULL,
    PRIMARY KEY (snapshot_id, contract_id)
);

CREATE INDEX IF NOT EXISTS contracts_pair_idx
    ON ai_profiler.contracts(snapshot_id, source_service, target_service);

CREATE TABLE IF NOT EXISTS ai_profiler.processes (
    snapshot_id text NOT NULL REFERENCES ai_profiler.snapshots(snapshot_id) ON DELETE CASCADE,
    process_id text NOT NULL,
    payload jsonb NOT NULL,
    PRIMARY KEY (snapshot_id, process_id)
);

CREATE TABLE IF NOT EXISTS ai_profiler.field_links (
    snapshot_id text NOT NULL REFERENCES ai_profiler.snapshots(snapshot_id) ON DELETE CASCADE,
    link_no integer NOT NULL,
    contract_id text,
    source_service text,
    target_service text,
    field_name text,
    source_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
    target_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
    proof_level text,
    confirmed boolean NOT NULL DEFAULT false,
    payload jsonb NOT NULL,
    PRIMARY KEY (snapshot_id, link_no)
);

CREATE INDEX IF NOT EXISTS field_links_contract_idx
    ON ai_profiler.field_links(snapshot_id, contract_id);

CREATE INDEX IF NOT EXISTS field_links_lookup_idx
    ON ai_profiler.field_links(snapshot_id, source_service, target_service, field_name);

CREATE TABLE IF NOT EXISTS ai_profiler.artifacts (
    snapshot_id text NOT NULL REFERENCES ai_profiler.snapshots(snapshot_id) ON DELETE CASCADE,
    artifact_id text NOT NULL,
    file_name text NOT NULL,
    relative_path text NOT NULL,
    media_type text NOT NULL,
    size_bytes bigint NOT NULL,
    PRIMARY KEY (snapshot_id, artifact_id)
);

CREATE INDEX IF NOT EXISTS artifacts_name_idx
    ON ai_profiler.artifacts(snapshot_id, file_name);
