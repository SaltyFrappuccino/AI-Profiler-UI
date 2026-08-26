import { resolve, relative, dirname, basename, sep } from "node:path";
import { existsSync } from "node:fs";
import { closeDatabase, db } from "../db/database";
import { migrate } from "../db/migrate";
import { sequenceDocument } from "../db/projections";

type JsonObject = Record<string, any>;

function values(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function objects(value: unknown): JsonObject[] {
  return values(value).filter((item): item is JsonObject => Boolean(item && typeof item === "object"));
}

function option(name: string): string {
  const index = Bun.argv.indexOf(name);
  return index >= 0 ? Bun.argv[index + 1] || "" : "";
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "snapshot";
}

async function sha256(file: Bun.BunFile): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Buffer.from(digest).toString("hex");
}

async function artifactRows(snapshotId: string, reportPath: string): Promise<JsonObject[]> {
  const root = dirname(reportPath);
  const artifactRoot = resolve(root, "datasurf", "contracts");
  if (!existsSync(artifactRoot)) return [];
  const rows: JsonObject[] = [];
  const glob = new Bun.Glob("**/*");
  for await (const item of glob.scan({ cwd: artifactRoot, onlyFiles: true })) {
    const fullPath = resolve(artifactRoot, item);
    const file = Bun.file(fullPath);
    const extension = item.toLowerCase().split(".").pop();
    if (!new Set(["xlsx", "xls", "csv", "json"]).has(extension || "")) continue;
    const relativePath = relative(resolve(import.meta.dir, ".."), fullPath).split(sep).join("/");
    rows.push({
      snapshot_id: snapshotId,
      artifact_id: `${slug(basename(item))}-${rows.length}`,
      file_name: basename(item),
      relative_path: relativePath,
      media_type: extension === "csv"
        ? "text/csv; charset=utf-8"
        : extension === "json"
          ? "application/json"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size_bytes: file.size,
    });
  }
  return rows;
}

function normalizedRows(snapshotId: string, document: JsonObject) {
  const sourceGroups = objects(document.sourceGroups).map((item) => ({
    snapshot_id: snapshotId,
    group_id: String(item.groupId),
    service_count: values(item.serviceIds).length,
    payload: item,
  }));
  const models = objects(document.schemaModelCatalog).map((item, index) => {
    const serviceId = String(item.serviceId || "unknown");
    const localId = String(item.modelVariantKey || item.modelKey || item.modelName || index);
    return {
      snapshot_id: snapshotId,
      model_id: `${serviceId}:${localId}`,
      service_id: serviceId,
      model_key: String(item.modelKey || localId),
      model_name: String(item.modelName || item.canonicalTypeName || localId),
      canonical_type_name: item.canonicalTypeName || null,
      model_origin: item.modelOrigin || null,
      contract_authority: item.contractAuthority || null,
      field_count: Number(item.fieldCount || 0),
      schema_version: item.schemaVersion || null,
      payload: item,
    };
  });
  const modelFields = models.flatMap((model) => values(model.payload.fieldPaths).map((fieldPath, index) => ({
    snapshot_id: snapshotId,
    model_id: model.model_id,
    field_no: index,
    field_path: String(fieldPath),
  })));
  const processes = objects(document.processes);
  const processSteps = processes.flatMap((process) => objects(process.steps).map((step, index) => ({
    snapshot_id: snapshotId,
    process_id: String(process.processId),
    step_id: String(step.stepId || `${process.processId}:${index}`),
    contract_id: String(step.contractId),
    display_order: Number(step.step || index + 1),
    stage: Number.isFinite(Number(step.stage)) ? Number(step.stage) : null,
    source_service: step.sourceService || null,
    target_service: step.targetService || null,
    ordering: step.ordering || null,
    execution_mode: step.executionMode || null,
    process_continuity: step.processInstanceIdentity || step.handoffInstanceIdentity || null,
    source_file: step.sourceFile || null,
    source_line: Number.isFinite(Number(step.sourceLine)) ? Number(step.sourceLine) : null,
    payload: step,
  })));
  const processRelations = processes.flatMap((process) => objects(process.processIr?.relations).map((relation, index) => ({
    snapshot_id: snapshotId,
    process_id: String(process.processId),
    relation_id: String(relation.relationId || `${process.processId}:${index}`),
    source_step_id: String(relation.fromNodeId || ""),
    target_step_id: String(relation.toNodeId || ""),
    relation_kind: String(relation.kind || "unknown"),
    evidence: relation.evidence || null,
    payload: relation,
  })));
  const identityNodes = objects(document.modelIdentityGraph?.nodes).map((item) => ({
    snapshot_id: snapshotId,
    node_id: String(item.id),
    node_type: String(item.type || "unknown"),
    label: String(item.label || item.id),
    normalized_name: item.normalizedName || null,
    identity_status: item.identityEvidenceStatus || null,
    payload: item,
  }));
  const identityEdges = objects(document.modelIdentityGraph?.edges).map((item, index) => ({
    snapshot_id: snapshotId,
    edge_no: index,
    source_node_id: String(item.source),
    target_node_id: String(item.target),
    edge_kind: String(item.kind || "unknown"),
    payload: item,
  }));
  const evidenceRefs: JsonObject[] = [];
  for (const step of processSteps) {
    if (!step.source_file) continue;
    evidenceRefs.push({
      snapshot_id: snapshotId,
      evidence_no: evidenceRefs.length,
      subject_type: "process_step",
      subject_id: step.step_id,
      evidence_kind: step.payload.orderEvidence || "code_reference",
      file_path: step.source_file,
      line_no: step.source_line,
      fact_id: null,
      payload: { reason: step.payload.reason || "", executionRouteId: step.payload.executionRouteId || "" },
    });
  }
  const citedSubjects = [
    ...identityNodes.map((node) => ({ type: "model_identity_node", id: node.node_id, citations: objects(node.payload.citations) })),
    ...identityEdges.map((edge) => ({
      type: "model_identity_edge",
      id: `${edge.source_node_id}->${edge.target_node_id}:${edge.edge_kind}:${edge.edge_no}`,
      citations: objects(edge.payload.citations),
    })),
  ];
  for (const subject of citedSubjects) {
    for (const citation of subject.citations) {
      evidenceRefs.push({
        snapshot_id: snapshotId,
        evidence_no: evidenceRefs.length,
        subject_type: subject.type,
        subject_id: subject.id,
        evidence_kind: citation.kind || "citation",
        file_path: citation.path || null,
        line_no: Number.isFinite(Number(citation.line)) ? Number(citation.line) : null,
        fact_id: citation.factId || null,
        payload: citation,
      });
    }
  }
  return { sourceGroups, models, modelFields, processSteps, processRelations, identityNodes, identityEdges, evidenceRefs };
}

async function insertChunks(transaction: any, table: string, rows: JsonObject[], columns: string[]): Promise<void> {
  for (let index = 0; index < rows.length; index += 500) {
    const chunk = rows.slice(index, index + 500);
    if (chunk.length) await transaction`INSERT INTO ${transaction(table)} ${transaction(chunk, ...columns)}`;
  }
}

async function run(): Promise<void> {
  const suppliedPath = option("--report") || Bun.env.REPORT_PATH || "reports_system/three_fp_v39/system_lineage.json";
  const reportPath = resolve(process.cwd(), suppliedPath);
  const reportFile = Bun.file(reportPath);
  if (!(await reportFile.exists())) throw new Error(`Report not found: ${reportPath}`);

  await migrate();
  const sourceHash = await sha256(reportFile);
  const document = JSON.parse(await reportFile.text()) as JsonObject;
  const name = option("--name") || basename(dirname(reportPath));
  const snapshotId = option("--snapshot-id") || `${slug(name)}-${sourceHash.slice(0, 10)}`;
  const services = objects(document.services);
  const contracts = objects(document.contracts);
  const processes = objects(document.processes);
  const fieldLinks = objects(document.contractFieldLinks);
  const normalized = normalizedRows(snapshotId, document);
  const artifacts = await artifactRows(snapshotId, reportPath);
  const sql = db();

  await sql.begin(async (transaction) => {
    await transaction`
      INSERT INTO ai_profiler.snapshots
        (snapshot_id, name, source_hash, source_file, summary, sequence_document, document)
      VALUES (
        ${snapshotId}, ${name}, ${sourceHash}, ${reportPath},
        ${transaction.json(document.summary || {})},
        ${transaction.json(sequenceDocument(document))},
        ${transaction.json(document)}
      )
      ON CONFLICT (snapshot_id) DO UPDATE SET
        name = EXCLUDED.name,
        source_hash = EXCLUDED.source_hash,
        source_file = EXCLUDED.source_file,
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
        (import_id, snapshot_id, source_hash, source_file, row_counts)
      VALUES (
        ${crypto.randomUUID()}, ${snapshotId}, ${sourceHash}, ${reportPath},
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

  console.log(JSON.stringify({
    snapshotId,
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
  }, null, 2));
}

try {
  await run();
} finally {
  await closeDatabase();
}
