import { db } from "../db/database";
import { json, message } from "./responses";

type JsonObject = Record<string, any>;

export async function storageArchitecture(snapshotId: string): Promise<Response> {
  const sql = db();
  const snapshots = await sql<JsonObject[]>`
    SELECT snapshot_id, name, source_hash, source_file, report_schema_version, imported_at,
           pg_column_size(document)::bigint AS document_bytes
    FROM ai_profiler.snapshots
    WHERE snapshot_id = ${snapshotId}
  `;
  if (!snapshots.length) return message("snapshot not found", 404);
  const [counts, tables, migrations, integrity, indexes, imports, runtime] = await Promise.all([
    sql<JsonObject[]>`
      SELECT
        (SELECT count(*)::int FROM ai_profiler.snapshots WHERE snapshot_id = ${snapshotId}) AS snapshots,
        (SELECT count(*)::int FROM ai_profiler.report_imports WHERE snapshot_id = ${snapshotId}) AS report_imports,
        (SELECT count(*)::int FROM ai_profiler.source_groups WHERE snapshot_id = ${snapshotId}) AS source_groups,
        (SELECT count(*)::int FROM ai_profiler.services WHERE snapshot_id = ${snapshotId}) AS services,
        (SELECT count(*)::int FROM ai_profiler.models WHERE snapshot_id = ${snapshotId}) AS models,
        (SELECT count(*)::int FROM ai_profiler.model_fields WHERE snapshot_id = ${snapshotId}) AS model_fields,
        (SELECT count(*)::int FROM ai_profiler.model_identity_nodes WHERE snapshot_id = ${snapshotId}) AS model_identity_nodes,
        (SELECT count(*)::int FROM ai_profiler.model_identity_edges WHERE snapshot_id = ${snapshotId}) AS model_identity_edges,
        (SELECT count(*)::int FROM ai_profiler.contracts WHERE snapshot_id = ${snapshotId}) AS contracts,
        (SELECT count(*)::int FROM ai_profiler.field_links WHERE snapshot_id = ${snapshotId}) AS field_links,
        (SELECT count(*)::int FROM ai_profiler.processes WHERE snapshot_id = ${snapshotId}) AS processes,
        (SELECT count(*)::int FROM ai_profiler.process_steps WHERE snapshot_id = ${snapshotId}) AS process_steps,
        (SELECT count(*)::int FROM ai_profiler.process_relations WHERE snapshot_id = ${snapshotId}) AS process_relations,
        (SELECT count(*)::int FROM ai_profiler.evidence_refs WHERE snapshot_id = ${snapshotId}) AS evidence_refs,
        (SELECT count(*)::int FROM ai_profiler.artifacts WHERE snapshot_id = ${snapshotId}) AS artifacts
    `,
    sql<JsonObject[]>`
      SELECT relname AS table_name,
             pg_total_relation_size(format('%I.%I', schemaname, relname))::bigint AS total_bytes
      FROM pg_stat_user_tables
      WHERE schemaname = 'ai_profiler'
      ORDER BY relname
    `,
    sql<JsonObject[]>`SELECT version, applied_at FROM ai_profiler.schema_migrations ORDER BY version`,
    sql<JsonObject[]>`
      SELECT
        count(*) FILTER (WHERE constraints.contype = 'p')::int AS primary_keys,
        count(*) FILTER (WHERE constraints.contype = 'f')::int AS foreign_keys,
        count(*) FILTER (WHERE constraints.contype = 'u')::int AS unique_constraints
      FROM pg_catalog.pg_constraint AS constraints
      JOIN pg_catalog.pg_namespace AS namespaces ON namespaces.oid = constraints.connamespace
      WHERE namespaces.nspname = 'ai_profiler'
    `,
    sql<JsonObject[]>`SELECT count(*)::int AS count FROM pg_indexes WHERE schemaname = 'ai_profiler'`,
    sql<JsonObject[]>`
      SELECT import_id, imported_at, report_schema_version, row_counts
      FROM ai_profiler.report_imports
      WHERE snapshot_id = ${snapshotId}
      ORDER BY imported_at DESC
      LIMIT 1
    `,
    sql<JsonObject[]>`
      SELECT current_database() AS database_name,
             current_setting('server_version') AS server_version,
             pg_database_size(current_database())::bigint AS database_bytes
    `,
  ]);
  return json({
    storage: "postgresql",
    available: true,
    snapshot: snapshots[0],
    runtime: runtime[0],
    counts: counts[0],
    tables,
    migrations,
    integrity: { ...integrity[0], indexes: indexes[0].count },
    latestImport: imports[0] || null,
    storageModel: {
      layers: [
        { id: "snapshot", title: "Снимок анализа", tables: ["snapshots", "report_imports"] },
        { id: "catalog", title: "Каталог системы", tables: ["source_groups", "services", "models", "model_fields", "model_identity_nodes", "model_identity_edges"] },
        { id: "lineage", title: "Граф выполнения и данных", tables: ["contracts", "field_links", "processes", "process_steps", "process_relations", "evidence_refs"] },
        { id: "delivery", title: "Артефакты поставки", tables: ["artifacts"] },
      ],
      relationships: [
        ["snapshots", "services", "1:N"],
        ["services", "models", "1:N"],
        ["models", "model_fields", "1:N"],
        ["services", "contracts", "N:M"],
        ["contracts", "field_links", "1:N"],
        ["processes", "process_steps", "1:N"],
        ["contracts", "process_steps", "1:N"],
        ["process_steps", "process_relations", "N:M"],
        ["model_identity_nodes", "model_identity_edges", "N:M"],
        ["snapshots", "evidence_refs", "1:N"],
        ["snapshots", "artifacts", "1:N"],
      ],
    },
  });
}
