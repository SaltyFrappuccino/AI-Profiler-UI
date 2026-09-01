import { db } from "../db/database";
import { sequenceDocument } from "../db/projections";
import type { ArtifactRow } from "./report-artifacts";
import type { JsonObject, NormalizedRows } from "./report-normalization";

async function insertChunks(transaction: any, table: string, rows: JsonObject[], columns: string[]): Promise<void> {
  for (let index = 0; index < rows.length; index += 500) {
    const chunk = rows.slice(index, index + 500);
    if (chunk.length) await transaction`INSERT INTO ${transaction(table)} ${transaction(chunk, ...columns)}`;
  }
}

export interface PersistReportInput {
  snapshotId: string;
  name: string;
  sourceHash: string;
  reportPath: string;
  document: JsonObject;
  services: JsonObject[];
  contracts: JsonObject[];
  processes: JsonObject[];
  fieldLinks: JsonObject[];
  normalized: NormalizedRows;
  artifacts: ArtifactRow[];
}

export async function persistReport(input: PersistReportInput): Promise<void> {
  const {
    snapshotId,
    name,
    sourceHash,
    reportPath,
    document,
    services,
    contracts,
    processes,
    fieldLinks,
    normalized,
    artifacts,
  } = input;

  const sql = db({ readOnly: false });

  await sql.begin(async (transaction) => {
    await transaction`
      INSERT INTO ai_profiler.snapshots
        (snapshot_id, name, source_hash, source_file, report_schema_version, summary, sequence_document, document)
      VALUES (
        ${snapshotId}, ${name}, ${sourceHash}, ${reportPath}, ${document.schemaVersion},
        ${transaction.json(document.summary || {})},
        ${transaction.json(sequenceDocument(document))},
        ${transaction.json(document)}
      )
      ON CONFLICT (snapshot_id) DO UPDATE SET
        name = EXCLUDED.name,
        source_hash = EXCLUDED.source_hash,
        source_file = EXCLUDED.source_file,
        report_schema_version = EXCLUDED.report_schema_version,
        imported_at = now(),
        summary = EXCLUDED.summary,
        sequence_document = EXCLUDED.sequence_document,
        document = EXCLUDED.document
    `;
    for (const table of [
      "evidence_refs", "model_identity_edges", "model_identity_nodes", "process_relations", "process_steps",
      "model_fields", "models", "source_groups", "field_links", "artifacts", "processes", "contracts", "services",
    ]) {
      await transaction`DELETE FROM ${transaction(`ai_profiler.${table}`)} WHERE snapshot_id = ${snapshotId}`;
    }
    await insertChunks(transaction, "ai_profiler.services", services.map((item: JsonObject, index: number) => ({
      snapshot_id: snapshotId,
      service_id: String(item.serviceId || item.id || index),
      source_group: item.sourceGroup || "unknown",
      display_name: item.displayName || item.serviceId || item.id || null,
      source_root: item.sourceRoot || null,
      payload: transaction.json(item),
    })), ["snapshot_id", "service_id", "source_group", "display_name", "source_root", "payload"]);
    await insertChunks(transaction, "ai_profiler.contracts", contracts.map((item: JsonObject, index: number) => ({
      snapshot_id: snapshotId,
      contract_id: String(item.contractId || index),
      source_service: item.sourceService || null,
      target_service: item.targetService || null,
      source_group: item.sourceGroup || null,
      target_group: item.targetGroup || null,
      transport: item.transport || null,
      integration_scope: item.integrationScope || null,
      proof_level: item.proofLevel || null,
      quality_tier: item.qualityTier || null,
      confirmed: Boolean(item.confirmed),
      payload: transaction.json(item),
    })), [
      "snapshot_id", "contract_id", "source_service", "target_service", "source_group", "target_group", "transport",
      "integration_scope", "proof_level", "quality_tier", "confirmed", "payload",
    ]);
    await insertChunks(transaction, "ai_profiler.processes", processes.map((item: JsonObject, index: number) => ({
      snapshot_id: snapshotId,
      process_id: String(item.processId || index),
      entry_service: item.entryService || null,
      process_kind: item.processKind || null,
      closure_status: item.closureStatus || null,
      source_group_count: Number(item.sourceGroupCount || 0),
      payload: transaction.json(item),
    })), ["snapshot_id", "process_id", "entry_service", "process_kind", "closure_status", "source_group_count", "payload"]);
    await insertChunks(transaction, "ai_profiler.field_links", fieldLinks.map((item: JsonObject, index: number) => ({
      snapshot_id: snapshotId,
      link_no: index,
      contract_id: item.contractId || null,
      source_service: item.sourceService || null,
      target_service: item.targetService || null,
      field_name: item.field || null,
      source_paths: transaction.json(item.sourcePaths || []),
      target_paths: transaction.json(item.targetPaths || []),
      proof_level: item.proofLevel || null,
      confirmed: Boolean(item.confirmed),
      payload: transaction.json(item),
    })), [
      "snapshot_id", "link_no", "contract_id", "source_service", "target_service", "field_name",
      "source_paths", "target_paths", "proof_level", "confirmed", "payload",
    ]);
    await insertChunks(transaction, "ai_profiler.artifacts", artifacts, [
      "snapshot_id", "artifact_id", "file_name", "relative_path", "media_type", "size_bytes",
    ]);
    await insertChunks(transaction, "ai_profiler.source_groups", normalized.sourceGroups.map((item) => ({
      ...item, payload: transaction.json(item.payload),
    })), ["snapshot_id", "group_id", "service_count", "payload"]);
    await insertChunks(transaction, "ai_profiler.models", normalized.models.map((item) => ({
      ...item, payload: transaction.json(item.payload),
    })), [
      "snapshot_id", "model_id", "service_id", "model_key", "model_name", "canonical_type_name", "model_origin",
      "contract_authority", "field_count", "schema_version", "payload",
    ]);
    await insertChunks(transaction, "ai_profiler.model_fields", normalized.modelFields, [
      "snapshot_id", "model_id", "field_no", "field_path",
    ]);
    await insertChunks(transaction, "ai_profiler.process_steps", normalized.processSteps.map((item) => ({
      ...item, payload: transaction.json(item.payload),
    })), [
      "snapshot_id", "process_id", "step_id", "contract_id", "display_order", "stage", "source_service",
      "target_service", "ordering", "execution_mode", "process_continuity", "source_file", "source_line", "payload",
    ]);
    await insertChunks(transaction, "ai_profiler.process_relations", normalized.processRelations.map((item) => ({
      ...item, payload: transaction.json(item.payload),
    })), [
      "snapshot_id", "process_id", "relation_id", "source_step_id", "target_step_id", "relation_kind", "evidence", "payload",
    ]);
    await insertChunks(transaction, "ai_profiler.model_identity_nodes", normalized.identityNodes.map((item) => ({
      ...item, payload: transaction.json(item.payload),
    })), ["snapshot_id", "node_id", "node_type", "label", "normalized_name", "identity_status", "payload"]);
    await insertChunks(transaction, "ai_profiler.model_identity_edges", normalized.identityEdges.map((item) => ({
      ...item, payload: transaction.json(item.payload),
    })), ["snapshot_id", "edge_no", "source_node_id", "target_node_id", "edge_kind", "payload"]);
    await insertChunks(transaction, "ai_profiler.evidence_refs", normalized.evidenceRefs.map((item) => ({
      ...item, payload: transaction.json(item.payload),
    })), [
      "snapshot_id", "evidence_no", "subject_type", "subject_id", "evidence_kind", "file_path", "line_no", "fact_id", "payload",
    ]);
    await transaction`
      INSERT INTO ai_profiler.report_imports
        (import_id, snapshot_id, source_hash, source_file, report_schema_version, row_counts)
      VALUES (
        ${crypto.randomUUID()}, ${snapshotId}, ${sourceHash}, ${reportPath}, ${document.schemaVersion},
        ${transaction.json({
          services: services.length,
          contracts: contracts.length,
          processes: processes.length,
          processSteps: normalized.processSteps.length,
          processRelations: normalized.processRelations.length,
          models: normalized.models.length,
          modelFields: normalized.modelFields.length,
          modelIdentityNodes: normalized.identityNodes.length,
          modelIdentityEdges: normalized.identityEdges.length,
          fieldLinks: fieldLinks.length,
          evidenceRefs: normalized.evidenceRefs.length,
          artifacts: artifacts.length,
        })}
      )
    `;
  });
}
