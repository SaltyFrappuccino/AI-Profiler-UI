export type JsonObject = Record<string, any>;

function values(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

export function objects(value: unknown): JsonObject[] {
  return values(value).filter((item): item is JsonObject => Boolean(item && typeof item === "object"));
}

export function normalizedRows(snapshotId: string, document: JsonObject) {
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

export function normalizedRowErrors(document: JsonObject, normalized: ReturnType<typeof normalizedRows>): string[] {
  const errors: string[] = [];
  const serviceIds = new Set(objects(document.services).map((item, index) => String(item.serviceId || item.id || index)));
  const contractIds = new Set(objects(document.contracts).map((item, index) => String(item.contractId || item.id || index)));
  const processIds = new Set(objects(document.processes).map((item, index) => String(item.processId || item.id || index)));
  const modelIds = new Set(normalized.models.map((item) => item.model_id));
  const stepIds = new Set(normalized.processSteps.map((item) => `${item.process_id}:${item.step_id}`));
  const identityNodeIds = new Set(normalized.identityNodes.map((item) => item.node_id));

  for (const model of normalized.models) {
    if (!serviceIds.has(model.service_id)) errors.push(`model ${model.model_id} references unknown service ${model.service_id}`);
  }
  for (const field of normalized.modelFields) {
    if (!modelIds.has(field.model_id)) errors.push(`model field ${field.field_path} references unknown model ${field.model_id}`);
  }
  for (const step of normalized.processSteps) {
    if (!processIds.has(step.process_id)) errors.push(`step ${step.step_id} references unknown process ${step.process_id}`);
    if (!contractIds.has(step.contract_id)) errors.push(`step ${step.step_id} references unknown contract ${step.contract_id}`);
  }
  for (const relation of normalized.processRelations) {
    const source = `${relation.process_id}:${relation.source_step_id}`;
    const target = `${relation.process_id}:${relation.target_step_id}`;
    if (!stepIds.has(source)) errors.push(`relation ${relation.relation_id} references unknown source step ${relation.source_step_id}`);
    if (!stepIds.has(target)) errors.push(`relation ${relation.relation_id} references unknown target step ${relation.target_step_id}`);
  }
  for (const edge of normalized.identityEdges) {
    if (!identityNodeIds.has(edge.source_node_id)) {
      errors.push(`identity edge ${edge.edge_no} references unknown source node ${edge.source_node_id}`);
    }
    if (!identityNodeIds.has(edge.target_node_id)) {
      errors.push(`identity edge ${edge.edge_no} references unknown target node ${edge.target_node_id}`);
    }
  }
  return errors;
}

export type NormalizedRows = ReturnType<typeof normalizedRows>;
