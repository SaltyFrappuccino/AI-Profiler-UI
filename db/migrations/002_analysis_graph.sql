ALTER TABLE ai_profiler.services
    ADD COLUMN IF NOT EXISTS display_name text,
    ADD COLUMN IF NOT EXISTS source_root text;

ALTER TABLE ai_profiler.contracts
    ADD COLUMN IF NOT EXISTS source_group text,
    ADD COLUMN IF NOT EXISTS target_group text,
    ADD COLUMN IF NOT EXISTS transport text,
    ADD COLUMN IF NOT EXISTS integration_scope text,
    ADD COLUMN IF NOT EXISTS quality_tier text;

ALTER TABLE ai_profiler.processes
    ADD COLUMN IF NOT EXISTS entry_service text,
    ADD COLUMN IF NOT EXISTS process_kind text,
    ADD COLUMN IF NOT EXISTS closure_status text,
    ADD COLUMN IF NOT EXISTS source_group_count integer;

CREATE TABLE IF NOT EXISTS ai_profiler.source_groups (
    snapshot_id text NOT NULL REFERENCES ai_profiler.snapshots(snapshot_id) ON DELETE CASCADE,
    group_id text NOT NULL,
    service_count integer NOT NULL DEFAULT 0,
    payload jsonb NOT NULL,
    PRIMARY KEY (snapshot_id, group_id)
);

CREATE TABLE IF NOT EXISTS ai_profiler.models (
    snapshot_id text NOT NULL,
    model_id text NOT NULL,
    service_id text NOT NULL,
    model_key text NOT NULL,
    model_name text NOT NULL,
    canonical_type_name text,
    model_origin text,
    contract_authority text,
    field_count integer NOT NULL DEFAULT 0,
    schema_version text,
    payload jsonb NOT NULL,
    PRIMARY KEY (snapshot_id, model_id),
    FOREIGN KEY (snapshot_id, service_id)
        REFERENCES ai_profiler.services(snapshot_id, service_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS models_service_idx
    ON ai_profiler.models(snapshot_id, service_id, model_key);

CREATE INDEX IF NOT EXISTS models_canonical_type_idx
    ON ai_profiler.models(snapshot_id, canonical_type_name);

CREATE TABLE IF NOT EXISTS ai_profiler.model_fields (
    snapshot_id text NOT NULL,
    model_id text NOT NULL,
    field_no integer NOT NULL,
    field_path text NOT NULL,
    PRIMARY KEY (snapshot_id, model_id, field_no),
    FOREIGN KEY (snapshot_id, model_id)
        REFERENCES ai_profiler.models(snapshot_id, model_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS model_fields_path_idx
    ON ai_profiler.model_fields(snapshot_id, field_path);

CREATE TABLE IF NOT EXISTS ai_profiler.process_steps (
    snapshot_id text NOT NULL,
    process_id text NOT NULL,
    step_id text NOT NULL,
    contract_id text NOT NULL,
    display_order integer NOT NULL,
    stage integer,
    source_service text,
    target_service text,
    ordering text,
    execution_mode text,
    process_continuity text,
    source_file text,
    source_line integer,
    payload jsonb NOT NULL,
    PRIMARY KEY (snapshot_id, process_id, step_id),
    FOREIGN KEY (snapshot_id, process_id)
        REFERENCES ai_profiler.processes(snapshot_id, process_id) ON DELETE CASCADE,
    FOREIGN KEY (snapshot_id, contract_id)
        REFERENCES ai_profiler.contracts(snapshot_id, contract_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS process_steps_order_idx
    ON ai_profiler.process_steps(snapshot_id, process_id, display_order);

CREATE INDEX IF NOT EXISTS process_steps_contract_idx
    ON ai_profiler.process_steps(snapshot_id, contract_id);

CREATE TABLE IF NOT EXISTS ai_profiler.process_relations (
    snapshot_id text NOT NULL,
    process_id text NOT NULL,
    relation_id text NOT NULL,
    source_step_id text NOT NULL,
    target_step_id text NOT NULL,
    relation_kind text NOT NULL,
    evidence text,
    payload jsonb NOT NULL,
    PRIMARY KEY (snapshot_id, process_id, relation_id),
    FOREIGN KEY (snapshot_id, process_id)
        REFERENCES ai_profiler.processes(snapshot_id, process_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS process_relations_traversal_idx
    ON ai_profiler.process_relations(snapshot_id, process_id, source_step_id, target_step_id);

CREATE TABLE IF NOT EXISTS ai_profiler.model_identity_nodes (
    snapshot_id text NOT NULL REFERENCES ai_profiler.snapshots(snapshot_id) ON DELETE CASCADE,
    node_id text NOT NULL,
    node_type text NOT NULL,
    label text NOT NULL,
    normalized_name text,
    identity_status text,
    payload jsonb NOT NULL,
    PRIMARY KEY (snapshot_id, node_id)
);

CREATE INDEX IF NOT EXISTS model_identity_nodes_name_idx
    ON ai_profiler.model_identity_nodes(snapshot_id, normalized_name);

CREATE TABLE IF NOT EXISTS ai_profiler.model_identity_edges (
    snapshot_id text NOT NULL,
    edge_no integer NOT NULL,
    source_node_id text NOT NULL,
    target_node_id text NOT NULL,
    edge_kind text NOT NULL,
    payload jsonb NOT NULL,
    PRIMARY KEY (snapshot_id, edge_no),
    FOREIGN KEY (snapshot_id, source_node_id)
        REFERENCES ai_profiler.model_identity_nodes(snapshot_id, node_id) ON DELETE CASCADE,
    FOREIGN KEY (snapshot_id, target_node_id)
        REFERENCES ai_profiler.model_identity_nodes(snapshot_id, node_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS model_identity_edges_traversal_idx
    ON ai_profiler.model_identity_edges(snapshot_id, source_node_id, target_node_id, edge_kind);

CREATE TABLE IF NOT EXISTS ai_profiler.evidence_refs (
    snapshot_id text NOT NULL REFERENCES ai_profiler.snapshots(snapshot_id) ON DELETE CASCADE,
    evidence_no integer NOT NULL,
    subject_type text NOT NULL,
    subject_id text NOT NULL,
    evidence_kind text NOT NULL,
    file_path text,
    line_no integer,
    fact_id text,
    payload jsonb NOT NULL,
    PRIMARY KEY (snapshot_id, evidence_no)
);

CREATE INDEX IF NOT EXISTS evidence_refs_subject_idx
    ON ai_profiler.evidence_refs(snapshot_id, subject_type, subject_id);

CREATE INDEX IF NOT EXISTS evidence_refs_file_idx
    ON ai_profiler.evidence_refs(snapshot_id, file_path, line_no);

CREATE TABLE IF NOT EXISTS ai_profiler.report_imports (
    import_id text PRIMARY KEY,
    snapshot_id text NOT NULL REFERENCES ai_profiler.snapshots(snapshot_id) ON DELETE CASCADE,
    source_hash text NOT NULL,
    source_file text NOT NULL,
    imported_at timestamptz NOT NULL DEFAULT now(),
    row_counts jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS report_imports_snapshot_idx
    ON ai_profiler.report_imports(snapshot_id, imported_at DESC);
