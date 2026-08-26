const sequenceContractKeys = [
  "contractId",
  "sourceService",
  "targetService",
  "sourceGroup",
  "targetGroup",
  "integrationScope",
  "sourceExitId",
  "selectedTargetEntryId",
  "transport",
  "status",
  "evidenceTier",
  "qualityTier",
  "proofLevel",
  "contractLevel",
  "outputKind",
  "responseSemantics",
  "confirmed",
  "targetSourceRefCount",
  "sharedFieldCount",
  "sourceContractFieldCount",
  "maxTargetContractFieldCount",
  "sourcePayloadTypes",
  "targetPayloadTypes",
  "sourceResponsePayloadTypes",
  "targetResponsePayloadTypes",
  "responsePayloadCompatibility",
  "responseUsageEvidence",
  "architectureRegistryRefs",
  "sharedPayloadTypes",
  "carrierPayloadTypes",
  "carrierTargetPayloadTypes",
  "carrierPayloadSource",
  "weakReasons",
  "fieldModelStatus",
] as const;

type JsonObject = Record<string, any>;

function mappingSummary(contract: JsonObject): JsonObject {
  const mapping = contract.mapping || contract.crossServiceDataSurf || contract.dataSurf || {};
  return {
    status: mapping.status || "",
    strategy: mapping.strategy || "",
    file: mapping.file || "",
    leafRows: mapping.leafRows || 0,
    rowCount: mapping.rowCount || 0,
    resolvedFieldRowCount: mapping.resolvedFieldRowCount ?? mapping.leafRows ?? 0,
    unresolvedRowCount: mapping.unresolvedRowCount || 0,
    requestRowCount: mapping.requestRowCount || 0,
    responseRowCount: mapping.responseRowCount || 0,
    gapRows: mapping.gapRows || 0,
    objectRows: mapping.objectRows || 0,
    missingReason: mapping.missingReason || "",
    coverageStatus: mapping.coverageStatus || "unknown",
    coverageBasis: mapping.coverageBasis || "",
    coverageClass: mapping.coverageClass || "",
    sourceMappedFieldCount: mapping.sourceMappedFieldCount || 0,
    sourceSchemaFieldCount: mapping.sourceSchemaFieldCount || 0,
    sourceCoveragePct: mapping.sourceCoveragePct ?? null,
    targetMappedFieldCount: mapping.targetMappedFieldCount || 0,
    targetSchemaFieldCount: mapping.targetSchemaFieldCount || 0,
    targetCoveragePct: mapping.targetCoveragePct ?? null,
    unconsumedTransmittedFieldCount: mapping.unconsumedTransmittedFieldCount || 0,
    optionalConsumedFieldNotTransmittedCount: mapping.optionalConsumedFieldNotTransmittedCount || 0,
    provenMissingConsumedFieldCount: mapping.provenMissingConsumedFieldCount || 0,
    observedConsumedFieldNotTransmittedCount: mapping.observedConsumedFieldNotTransmittedCount || 0,
    unmappedSourceFields: mapping.unmappedSourceFields || [],
    unmappedTargetFields: mapping.unmappedTargetFields || [],
    coverageNote: mapping.coverageNote || "",
    directions: mapping.directions || [],
    requestSourcePayloadTypes: mapping.requestSourcePayloadTypes || [],
    requestTargetPayloadTypes: mapping.requestTargetPayloadTypes || [],
    responseSourcePayloadTypes: mapping.responseSourcePayloadTypes || [],
    responseTargetPayloadTypes: mapping.responseTargetPayloadTypes || [],
    csvHref: mapping.csvHref || "",
  };
}

export function compactContract(contract: JsonObject): JsonObject {
  const compact: JsonObject = {};
  for (const key of sequenceContractKeys) {
    if (key in contract) compact[key] = contract[key];
  }
  compact.targetContractFieldCount = contract.maxTargetContractFieldCount || 0;
  compact.fieldNames = (contract.sharedFieldDetails || [])
    .filter((item: unknown): item is JsonObject => Boolean(item && typeof item === "object"))
    .map((item: JsonObject) => item.field)
    .filter(Boolean);
  compact.mapping = mappingSummary(contract);
  compact.dataSurf = compact.mapping;
  compact.detailLoaded = false;
  return compact;
}

export function contractDetail(contract: JsonObject): JsonObject {
  const mapping = mappingSummary(contract);
  const fieldDetails = Array.isArray(contract.sharedFieldDetails) ? contract.sharedFieldDetails : [];
  const responseDetails = Array.isArray(contract.sharedResponseFieldDetails) ? contract.sharedResponseFieldDetails : [];
  return {
    ...contract,
    targetContractFieldCount: contract.maxTargetContractFieldCount || 0,
    fieldNames: fieldDetails.map((item: JsonObject) => item.field).filter(Boolean),
    responseFieldNames: responseDetails.map((item: JsonObject) => item.field).filter(Boolean),
    fieldPaths: [...fieldDetails, ...responseDetails].flatMap((item: JsonObject) => [
      ...(item.sourcePaths || []),
      ...(item.targetPaths || []),
    ]),
    mapping,
    dataSurf: mapping,
    detailLoaded: true,
  };
}

export function sequenceDocument(document: JsonObject): JsonObject {
  return {
    summary: document.summary || {},
    services: (document.services || []).map((service: JsonObject) => ({
      serviceId: service.serviceId || service.id,
      sourceGroup: service.sourceGroup || "unknown",
    })),
    edges: [],
    processes: document.processes || [],
    externalBridges: document.externalBridges || [],
    contracts: (document.contracts || []).map(compactContract),
    contractFieldLinks: (document.contractFieldLinks || []).map((link: JsonObject) => ({ confirmed: link.confirmed })),
    architectReadiness: document.architectReadiness || {},
    processReadiness: document.processReadiness || {},
    interactionBoundaryInventory: document.interactionBoundaryInventory || {},
    executionAssembly: document.executionAssembly || {},
    architectureRegistry: document.architectureRegistry || {},
    payloadMode: "sequence",
    storage: "postgresql",
  };
}
