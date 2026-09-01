const state = {
  view: "sequence",
  demo: false,
  snapshots: [],
  snapshot: null,
  graph: null,
  graphMode: "none",
  loadedViews: new Set(),
  contractDetailLoads: new Set(),
  sequence: {
    zoom: 1,
    diagramMode: "sequence",
    confidentOnly: true,
    completeOnly: false,
    scope: "all",
    filter: "",
    selectedId: "",
    selectedFragmentId: "",
    selectedStage: null,
    mapStage: null,
    mapView: "overview",
    mapFlow: "all",
    selectedRegionId: "",
    selectedRelationId: "",
    processId: "",
    processMembers: null,
    data: null,
    processMapData: null,
  },
  mappings: {
    confidentOnly: true,
    filter: "",
    selectedId: "",
    csvPreview: null,
    csvPreviewFor: "",
  },
  path: {
    from: "",
    to: "",
    confidentOnly: false,
    selected: 0,
  },
  reconstruction: {
    mode: "compare",
    processId: "",
    selectedStepId: "",
    aiQueueProcessId: "",
    aiQueue: null,
    aiQueueLoading: false,
    aiVerification: null,
    aiVerificationRunning: false,
    aiCommitRunning: false,
  },
  fieldJourney: {
    query: "",
    direction: "downstream",
    confirmedOnly: true,
    loading: false,
    result: null,
  },
  agent: {
    tab: "detail",
    loading: false,
    collapsed: false,
    history: [],
  },
};

const PROVEN_PROOFS = new Set([
  "exact_contract",
  "strong_contract",
  "field_contract",
  "schema_alias_field_contract",
  "topic_contract",
  "topology_fact",
  "payload_contract",
]);
const BRANCH_ORDERINGS = new Set([
  "alternative",
  "branch_variant",
  "failure_path",
  "parallel",
  "async_continuation",
  "dependent_async_stage",
  "completion_callback",
  "failure_callback",
]);

const $ = (id) => document.getElementById(id);
const {
  esc,
  fmt,
  formatBytes,
  pluralRu,
  countOf,
  norm,
  uniq,
  hasNumericValue,
  processNarrativeSummary,
  mappingCoverageLabel,
  contractMapping,
  processCorpusClosed,
  processClosureLabel,
  mappingDirectionsLabel,
} = globalThis.AIProfilerPresentation;

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

const agentPanel = globalThis.AIProfilerAgentPanel.create({
  state,
  getElement: $,
  request: api,
  esc,
  fmt,
  fitDiagram: fitSequence,
});
const setInspectorTab = agentPanel.setTab;
const setInspectorCollapsed = agentPanel.setCollapsed;
const updateAgentContext = agentPanel.updateContext;
const askProcessAgent = agentPanel.ask;
function setView(view) {
  const demoViews = new Set(["briefing", "reconstruction", "sequence", "mappings", "gaps"]);
  if (state.demo && !demoViews.has(view)) view = "briefing";
  if (state.demo && view === "sequence") {
    state.sequence.scope = "cross";
    state.sequence.confidentOnly = true;
    state.sequence.completeOnly = false;
    const scope = $("sequence-scope");
    const confident = $("sequence-confident-only");
    const complete = $("sequence-complete-only");
    if (scope) scope.value = "cross";
    if (confident) confident.checked = true;
    if (complete) complete.checked = false;
  }
  if (state.demo && view === "mappings" && !state.mappings.filter) {
    state.mappings.filter = "collation->mrtg-reo-secretary";
    const filter = $("mapping-filter");
    if (filter) filter.value = state.mappings.filter;
  }
  const sequenceViews = new Set(["sequence", "path", "overview"]);
  if (state.snapshot && sequenceViews.has(view) && state.graphMode !== "sequence") {
    state.view = view;
    $("api-state").textContent = "loading";
    loadSnapshot(state.snapshot.id).catch(showError);
    return;
  }
  const apiViews = new Set(["briefing", "reconstruction", "mappings", "models", "fields", "gaps", "architecture"]);
  if (state.snapshot && apiViews.has(view) && !state.loadedViews.has(view)) {
    state.view = view;
    $("api-state").textContent = "loading";
    api(`/api/snapshots/${encodeURIComponent(state.snapshot.id)}/views/${encodeURIComponent(view)}`)
      .then((payload) => {
        Object.assign(state.graph, payload);
        state.loadedViews.add(view);
        if (view === "mappings" || view === "fields") {
          state.loadedViews.add("mappings");
          state.loadedViews.add("fields");
        }
        $("api-state").textContent = "online";
        setView(view);
      })
      .catch(showError);
    return;
  }
  state.view = view;
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("active", el.id === `view-${view}`));
  document.querySelectorAll(".nav-item").forEach((el) => el.classList.toggle("active", el.dataset.view === view));
  const titles = {
    briefing: ["Для созвона", "Что реально найдено в трёх ФП, чему можно верить и где анализ пока обрывается."],
    overview: ["Межсервисный анализ", "Срез, готовность, связи и основные блокеры качества."],
    reconstruction: ["Сверка процесса с Excel", "Бизнес-ожидание, фактическая реализация в коде и видимые расхождения между ними."],
    sequence: ["Сиквенс вызовов", "Кто кого вызывает, какие модели передаются и где поля реально связаны."],
    path: ["Путь потока", "Маршрут между двумя сервисами: каждый шаг с моделью, доказательством и объяснением зачем."],
    mappings: ["Маппинги данных", "Excel-маппинги между моделями и сервисами с доказательствами по каждой строке."],
    models: ["Модели данных", "DTO, JSON/OpenAPI/DataSurf/AI identity graph и payload-типы."],
    fields: ["Пополевые связи", "Контрактные поля между сервисами и уровень доказательства."],
    gaps: ["Качество и разрывы", "Готовность среза, weak links, конфликты схем/DataSurf/code."],
    architecture: ["Архитектура данных", "Физическая модель PostgreSQL, состав загруженного среза и контроль целостности."],
  };
  const titleEl = $("view-title");
  if (titleEl) titleEl.textContent = titles[view]?.[0] || titles.sequence[0];
  const subtitleEl = $("view-subtitle");
  if (subtitleEl) subtitleEl.textContent = titles[view]?.[1] || titles.sequence[1];
  document.title = `AI Profiler — ${titles[view]?.[0] || "Сиквенс"}`;
  const params = new URLSearchParams(window.location.search);
  params.set("view", view);
  window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  renderCurrentView();
}

function fileUrl(path) {
  if (!path) return "";
  const value = String(path);
  return value.startsWith("/") ? value : `/file?path=${encodeURIComponent(value)}`;
}

function mappingViewUrl(contractId) {
  const params = new URLSearchParams({
    view: "mappings",
    snapshot: state.snapshot?.id || "",
    mapping: contractId || "",
  });
  return `/app/?${params.toString()}`;
}

function sequenceServiceName(service) {
  const raw = String(service || "").replace(/\\/g, "/").replace(/\/$/, "").split("/").pop();
  return raw
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function contractPairKey(source, target) {
  return `${source || ""}|${target || ""}`;
}

function contractsByPair(graph = state.graph) {
  const out = new Map();
  for (const contract of graph?.contracts || []) {
    const key = contractPairKey(contract.sourceService, contract.targetService);
    out.set(key, [...(out.get(key) || []), contract]);
  }
  return out;
}

function strictLegacyContract(contract) {
  const proof = String(contract?.proofLevel || "").toLowerCase();
  const fields = Number(contract?.sharedFieldCount || 0);
  return (
    contract?.status === "linked" &&
    fields > 0 &&
    ["exact_contract", "strong_contract", "field_contract", "schema_alias_field_contract"].includes(proof)
  );
}

function edgeTier(edge, pair) {
  const contracts = pair || [];
  if (edge?.confirmed === true || contracts.some((contract) => contract.confirmed === true)) return "confirmed";
  if (edge?.confirmed === undefined && contracts.some(strictLegacyContract)) return "confirmed";
  const proven = contracts.some((contract) => PROVEN_PROOFS.has(String(contract.proofLevel || "").toLowerCase()));
  const candidate = contracts.length && contracts.every((contract) => String(contract.proofLevel || "").toLowerCase().includes("candidate"));
  if (proven) return "proven";
  if (candidate || String(edge?.status || "").includes("candidate")) return "candidate";
  return "inferred";
}

function contractTier(contract) {
  if (contract?.confirmed === true || (contract?.confirmed === undefined && strictLegacyContract(contract))) return "confirmed";
  const proof = String(contract?.proofLevel || "").toLowerCase();
  if (PROVEN_PROOFS.has(proof)) return "proven";
  if (proof.includes("candidate") || String(contract?.status || "").includes("candidate")) return "candidate";
  return "inferred";
}

function tierText(tier) {
  return {
    confirmed: "уверенная",
    proven: "доказанная",
    inferred: "выведенная",
    candidate: "слабая",
    external: "внешний мост",
  }[tier] || tier;
}

function payloadDirection(payload, contracts) {
  return window.AIProfilerSequence?.payloadDirection(payload, contracts) || "unknown";
}

// edgeId -> восстановленный порядок вызова: детерминированный шаг/этап/причина из
// process.steps (call_order) + LLM-«зачем» (purpose) и нарратив процесса, если считались.
function orderInfoByEdge(graph = state.graph) {
  const out = new Map();
  (graph?.processes || []).forEach((proc, processIndex) => {
    for (const step of proc.steps || []) {
      if (!step.edgeId || out.has(step.edgeId)) continue;
      out.set(step.edgeId, {
        processIndex,
        processId: proc.processId,
        processName: proc.name,
        narrative: proc.narrative || "",
        narrativeSource: proc.narrativeSource || "llm",
        narrativeCitations: proc.narrativeCitations || [],
        narrativeGaps: proc.narrativeGaps || [],
        step: step.step,
        stage: step.stage,
        ordering: step.ordering || "",
        reason: step.reason || "",
        purpose: step.purpose || "",
        purposeSource: step.purposeSource || "llm",
        purposeCitations: step.purposeCitations || [],
        purposeGaps: step.purposeGaps || [],
        afterEdgeId: step.afterEdgeId || "",
      });
    }
  });
  return out;
}

function edgeSearchText(call) {
  return [
    call.sourceService,
    call.targetService,
    call.sourceLabel,
    call.targetLabel,
    call.payload,
    call.transport,
    call.proof,
    call.responseSemantics?.kind,
    call.responseSemantics?.detail,
    call.fields.join(" "),
  ].join(" ").toLowerCase();
}

function processBranchLabel(labels = []) {
  const branches = new Set(labels);
  if (branches.has("then") && branches.has("else")) return "в обеих ветках";
  const readable = labels.map((label) => ({ then: "условие выполнено", else: "условие не выполнено" }[label] || label));
  return readable.length ? `ветка: ${readable.join(" / ")}` : "условная ветка";
}

function processIdentityLabel(value) {
  return {
    same_process_proven: "тот же процесс доказан",
    same_process_supported: "тот же процесс поддержан фактами",
    independent_event: "создано независимое событие",
    unknown: "непрерывность не доказана",
  }[value] || "";
}

function sequencePayloadLabel(step, contract, edge) {
  const operation = contract.sourceHttpOperationVariant || edge.sourceHttpOperationVariant ||
    contract.sourceHttpOperation || edge.sourceHttpOperation || {};
  const method = String(operation.method || "").toUpperCase();
  const bodylessHttp = ["GET", "DELETE", "HEAD", "OPTIONS"].includes(method) && !operation.request_body_type;
  if (bodylessHttp) {
    const provenWireValues = (contract.sharedFieldDetails || [])
      .filter((detail) => String(detail.pathMatchStatus || "").startsWith("http_"))
      .flatMap((detail) => detail.sourcePaths || [])
      .map((value) => String(value).replace(/=(["'])(.*?)\1$/, "=$2"));
    const inferredWireValues = (operation.parameter_bindings || []).map((binding) => {
      const location = String(binding.location || "").toLowerCase();
      if (!['path', 'query', 'header'].includes(location)) return "";
      const wireName = binding.wire_name || binding.parameter_name || "";
      const parameter = String(binding.parameter_name || "");
      const literal = parameter.match(/^['"](.+)['"]$/);
      return literal ? `${wireName}=${literal[1]}` : wireName;
    }).filter(Boolean);
    const wireValues = provenWireValues.length ? provenWireValues : inferredWireValues;
    const response = (contract.sourceResponsePayloadTypes || []).find(Boolean);
    const request = uniq(wireValues).join(", ") || "без тела запроса";
    return response ? `${request} → ответ ${response}` : request;
  }
  const carrier = (contract.carrierPayloadTypes || contract.sharedPayloadTypes || contract.sourcePayloadTypes || []).find(Boolean);
  return step.payload || (contract.sharedPayloadTypes || []).find(Boolean) || carrier || step.transport || "payload";
}

function buildSequenceData(scale = state.sequence.zoom, options = {}) {
  const graph = state.graph;
  const query = state.sequence.filter.trim().toLowerCase();
  const applyFilters = options.applyFilters !== false;
  const tierCounts = { confirmed: 0, proven: 0, inferred: 0, candidate: 0 };
  const allCalls = [];
  let rawStepCount = 0;
  const focusProcess = state.sequence.processId
    ? (graph?.processes || []).find((p) => p.processId === state.sequence.processId)
    : null;
  const contractById = new Map((graph?.contracts || []).map((contract) => [contract.contractId, contract]));
  const edgeById = new Map((graph?.edges || []).map((edge) => [edge.edgeId, edge]));
  const groupByService = new Map((graph?.services || []).map((service) => [service.serviceId, service.sourceGroup || "unknown"]));
  const processes = focusProcess
    ? [focusProcess]
    : (graph?.processes || []).filter((process) =>
      !applyFilters || !state.sequence.completeOnly || processCorpusClosed(process)
    );

  processes.forEach((process, processIndex) => {
    const rawSteps = process.steps || [];
    const processIr = process.processIr || {};
    const irNodes = processIr.nodes || [];
    const irNodeByStepId = new Map(irNodes.map((node) => [node.stepId, node]));
    const irRegionById = new Map((processIr.controlRegions || []).map((region) => [region.regionId, region]));
    const irUnsequenced = new Set(processIr.unsequencedNodeIds || []);
    const irIncoming = new Map();
    for (const relation of processIr.relations || []) {
      const current = irIncoming.get(relation.toNodeId) || [];
      current.push(relation);
      irIncoming.set(relation.toNodeId, current);
    }
    rawStepCount += rawSteps.length;
    const displaySteps = window.AIProfilerSequence?.groupProcessSteps?.(rawSteps) || rawSteps;
    displaySteps.forEach((step) => {
      const rawStepIds = (step.rawStepIds || [step.stepId]).filter(Boolean);
      const stepIrNodes = rawStepIds.map((stepId) => irNodeByStepId.get(stepId)).filter(Boolean);
      const regionIds = uniq(stepIrNodes.flatMap((node) => node.controlRegionIds || []));
      const controlRegions = regionIds.map((regionId) => irRegionById.get(regionId)).filter(Boolean);
      const regionKinds = uniq(controlRegions.map((region) => region.kind));
      const branchLabels = uniq(controlRegions.flatMap((region) =>
        (region.arms || [])
          .filter((arm) => (arm.nodeIds || []).some((nodeId) => stepIrNodes.some((node) => node.nodeId === nodeId)))
          .map((arm) => arm.label)
      ));
      const irInfo = {
        runtimeTraceSafe: processIr.runtimeTraceSafe !== false,
        nodeIds: stepIrNodes.map((node) => node.nodeId),
        displayIndex: Math.min(...stepIrNodes.map((node) => Number(node.displayIndex || 0)).filter(Boolean), Number(step.step || 0)),
        regionKinds,
        branchLabels,
        controlRegions,
        causalRelations: stepIrNodes.flatMap((node) => irIncoming.get(node.nodeId) || []),
        unsequenced: stepIrNodes.some((node) => irUnsequenced.has(node.nodeId)),
      };
      const contract = contractById.get(step.contractId) || {};
      const edge = edgeById.get(step.edgeId) || {};
      const tier = contractTier(contract);
      tierCounts[tier] += 1;
      const pair = contract.contractId ? [contract] : [];
      const payload = sequencePayloadLabel(step, contract, edge);
      const responseSemantics = contract.responseSemantics || null;
      const fields = uniq(contract.fieldNames || contract.sharedFieldDetails?.map((detail) => detail.field) || []);
      const call = {
        id: `process:${process.processId}:${step.stepId || step.step || step.contractId}`,
        stepId: step.stepId || "",
        rawStepIds,
        edgeId: step.edgeId,
        contractId: step.contractId,
        edge,
        contract,
        contracts: pair,
        tier,
        sourceService: step.sourceService || contract.sourceService,
        targetService: step.targetService || contract.targetService,
        sourceGroup: contract.sourceGroup || groupByService.get(step.sourceService || contract.sourceService) || "unknown",
        targetGroup: contract.targetGroup || groupByService.get(step.targetService || contract.targetService) || "unknown",
        integrationScope: contract.integrationScope || "unknown",
        sourceLabel: sequenceServiceName(step.sourceService || contract.sourceService),
        targetLabel: sequenceServiceName(step.targetService || contract.targetService),
        payload,
        carrierSource: contract.carrierPayloadSource || "",
        carrierTarget: (contract.carrierTargetPayloadTypes || []).find(Boolean) || "",
        direction: responseSemantics?.direction || payloadDirection(payload, pair),
        proofTier: responseSemantics?.proofTier || "",
        transport: contract.transport || step.transport || "",
        proof: contract.proofLevel || contract.status || "",
        responseSemantics,
        sourceResponsePayloadTypes: contract.sourceResponsePayloadTypes || [],
        targetResponsePayloadTypes: contract.targetResponsePayloadTypes || [],
        responsePayloadCompatibility: contract.responsePayloadCompatibility || {},
        responseUsageEvidence: contract.responseUsageEvidence || {},
        sourceHttpOperationVariant: contract.sourceHttpOperationVariant || edge.sourceHttpOperationVariant || {},
        fields,
        sourceFields: contract.sourceContractFields || [],
        targetFields: contract.targetContractFields || [],
        fieldCount: Number(contract.sharedFieldCount || 0),
        sourceFieldCount: Number(contract.sourceContractFieldCount || (contract.sourceContractFields || []).length),
        targetFieldCount: Number(contract.targetContractFieldCount || (contract.targetContractFields || []).length),
        targetSourceRefCount: Number(contract.targetSourceRefCount || 0),
        qualityTier: contract.qualityTier || contract.evidenceTier || contract.proofLevel || contract.status || "candidate",
        outputKind: contract.outputKind || "business_integration",
        presentationExcluded: contract.presentationExcluded === true,
        presentationExclusionReason: contract.presentationExclusionReason || "",
        processAssemblyStatus: process.assemblyStatus || "",
        processAssemblyComplete: process.assemblyComplete !== false,
        processClosureStatus: process.closureStatus || "",
        processAssemblyReasons: process.assemblyReasons || [],
        variantCount: Number(step.variantCount || 1),
        routeVariants: step.routeVariants || [],
        processIr: irInfo,
        order: {
          processIndex,
          processId: process.processId,
          processName: process.name,
          narrative: process.narrative || "",
          narrativeSource: process.narrativeSource || "llm",
          narrativeCitations: process.narrativeCitations || [],
          narrativeGaps: process.narrativeGaps || [],
          sequenceSemantics: process.sequenceSemantics || "",
          step: step.step,
          stage: step.stage,
          ordering: step.ordering || "",
          reason: step.reason || "",
          purpose: step.purpose || "",
          purposeSource: step.purposeSource || "llm",
          purposeCitations: step.purposeCitations || [],
          purposeGaps: step.purposeGaps || [],
          afterEdgeId: step.afterEdgeId || "",
          handoffInstanceIdentity: step.handoffInstanceIdentity || "",
          handoffInstanceIdentityReason: step.handoffInstanceIdentityReason || "",
          processInstanceIdentity: step.processInstanceIdentity || "",
          processInstanceIdentityReason: step.processInstanceIdentityReason || "",
          correlationFields: step.correlationFields || [],
          entryPayloadPassthrough: step.entryPayloadPassthrough === true,
          responseLineage: step.responseLineage || {},
          responseUsageStatus: step.responseUsageStatus || "not_observed",
          eventIdentity: step.eventIdentity || {},
          readiness: step.readiness || null,
          processIr: irInfo,
        },
      };
      if (applyFilters && state.sequence.scope === "cross" && call.integrationScope !== "cross_source_group") return;
      if (applyFilters && state.sequence.scope.startsWith("group:")) {
        const selectedGroup = state.sequence.scope.slice(6);
        if (call.sourceGroup !== selectedGroup || call.targetGroup !== selectedGroup) return;
      }
      if (applyFilters && state.sequence.confidentOnly && (tier !== "confirmed" || call.presentationExcluded)) return;
      if (applyFilters && query && !edgeSearchText(call).includes(query)) return;
      allCalls.push(call);
    });
  });

  // Призрачные участники: код зовёт систему, которой нет в корпусе (externalBridges).
  // Показываем как пунктирную стрелку в «⋯ target (кода нет)» — гипотеза уровня «намерение
  // в коде», скрывается фильтром «только уверенные».
  // В фокусе процесса мосты тоже показываем — но только от его сервисов-участников.
  const focusMembers = focusProcess ? new Set(focusProcess.memberServices || []) : null;
  if (!(applyFilters && state.sequence.confidentOnly)) {
    (graph?.externalBridges || []).forEach((bridge, index) => {
      if (applyFilters && focusMembers && !focusMembers.has(bridge.sourceService)) return;
      if (applyFilters && state.sequence.scope === "cross" && bridge.integrationScope !== "cross_source_group") return;
      if (applyFilters && state.sequence.scope.startsWith("group:") && bridge.sourceGroup !== state.sequence.scope.slice(6)) return;
      const searchText = `${bridge.sourceService} ${bridge.likelyTarget} ${(bridge.payloadTypes || []).join(" ")}`.toLowerCase();
      if (applyFilters && query && !searchText.includes(query)) return;
      allCalls.push({
        id: `bridge:${index}`,
        isBridge: true,
        bridge,
        edge: {},
        contracts: [],
        tier: "external",
        sourceService: bridge.sourceService,
        targetService: `ext:${bridge.likelyTarget || index}`,
        sourceLabel: sequenceServiceName(bridge.sourceService),
        targetLabel: `⋯ ${bridge.likelyTarget || "внешний сервис"}`,
        payload: (bridge.payloadTypes || [])[0] || bridge.transportKind || "?",
        carrierSource: "",
        carrierTarget: "",
        direction: "request",
        proofTier: "",
        transport: bridge.transportKind || "",
        proof: "external_intent",
        responseSemantics: null,
        fields: [],
        fieldCount: 0,
        targetSourceRefCount: 0,
        qualityTier: "external_intent",
        order: null,
      });
    });
  }

  // Восстановленный порядок вызовов: сначала процессы по размеру (порядок манифеста),
  // внутри процесса — детерминированный шаг (call_order). Рёбра вне процессов — в конец,
  // их относительный порядок из манифеста сохраняется (sort стабилен).
  allCalls.sort((a, b) => {
    if (a.order && b.order) {
      return (a.order.processIndex ?? 0) - (b.order.processIndex ?? 0)
        || (a.processIr?.displayIndex ?? a.order.step ?? 0) - (b.processIr?.displayIndex ?? b.order.step ?? 0);
    }
    if (a.order) return -1;
    if (b.order) return 1;
    return 0;
  });

  const participants = [];
  const participantIndex = new Map();
  const ensureParticipant = (service, label) => {
    if (!participantIndex.has(service)) {
      participantIndex.set(service, participants.length);
      participants.push({ id: service, label });
    }
    return participantIndex.get(service);
  };

  for (const call of allCalls) {
    call.from = ensureParticipant(call.sourceService, call.sourceLabel);
    call.to = ensureParticipant(call.targetService, call.targetLabel);
  }

  const colGap = Math.max(172, Math.min(238, participants.length > 1 ? 1180 / (participants.length - 1) : 210));
  const baseLeft = 112;
  const baseTop = 92;
  const rowGap = 94;
  const procGap = 34;
  const labelW = 150;
  const width = Math.max(980, baseLeft * 2 + Math.max(0, participants.length - 1) * colGap + 260) * scale;

  participants.forEach((part, index) => {
    part.x = (baseLeft + index * colGap) * scale;
    part.labelW = labelW * scale;
  });

  // Разделители процессов прямо на диаграмме + НАСТОЯЩИЙ номер шага (восстановленный
  // порядок процесса), а не позиция в отфильтрованном списке: при включённых фильтрах
  // видны «дыры» в нумерации — это скрытые шаги, а не ошибка порядка.
  let cursorY = baseTop;
  let prevProcess = null;
  allCalls.forEach((call, index) => {
    const processName = call.isBridge
      ? "внешние мосты — ресивер вне корпуса (кода нет)"
      : (call.order ? (call.order.processName || call.order.processId) : "вне процессов — гипотезы-кандидаты, в порядок не входят");
    call.processBreak = processName !== prevProcess ? processName : "";
    prevProcess = processName;
    if (call.processBreak) cursorY += procGap;
    call.step = index + 1;
    call.displayStep = call.order ? call.order.step : index + 1;
    call.y = cursorY * scale;
    cursorY += rowGap;
    call.x1 = participants[call.from].x;
    call.x2 = participants[call.to].x;
  });
  const height = Math.max(520, cursorY + 140) * scale;
  const routeFragments = window.AIProfilerSequence?.buildRouteFragments?.(allCalls, scale) || [];

  return { width, height, scale, participants, calls: allCalls, routeFragments, tierCounts, rawStepCount };
}

function responseEvidence(call, allCalls) {
  return window.AIProfilerSequence?.responseEvidence(call, allCalls) || { kind: "unknown", label: "нет данных", detail: "" };
}

function renderMetrics() {
  if (!$("metrics")) return; // глобальная полоса KPI убрана — цифры живут в Обзоре
  const summary = state.graph?.summary || {};
  const readiness = state.graph?.architectReadiness || {};
  const evidenceCounts = readiness.evidence?.statusCounts || summary.contractEvidenceStatusCounts || {};
  const metrics = [
    ["Сервисов", summary.serviceCount],
    ["Контрактов", summary.contractCount],
    ["Service edges", summary.serviceEdgeCount],
    ["Field links", summary.contractFieldLinkCount],
    ["Readiness", readiness.score != null ? `${readiness.score}/100` : "—"],
    ["Proven contracts", `${fmt(countOf(evidenceCounts, "proven"))}/${fmt(summary.contractCount)}`],
  ];
  $("metrics").innerHTML = metrics.map(([label, value]) => `
    <article class="metric"><strong>${esc(value ?? "—")}</strong><span>${esc(label)}</span></article>
  `).join("");
}

function renderSequenceQuality(data) {
  const links = state.graph?.contractFieldLinks || [];
  const boundaries = state.graph?.interactionBoundaryInventory?.summary || {};
  const assembly = state.graph?.executionAssembly || {};
  const allCalls = buildSequenceData(1, { applyFilters: false }).calls.filter((call) => !call.isBridge);
  const shownUniqueCalls = new Set(data.calls.map((call) => call.contractId || call.id)).size;
  // Prefer honest backend proof tiers; fall back to client heuristic for old snapshots.
  const hasTiers = allCalls.some((call) => call.proofTier);
  const tierStats = allCalls.reduce((acc, call) => {
    const tier = call.proofTier || (responseEvidence(call, allCalls).kind === "same_model" ? "weak" : "none");
    acc[tier] = (acc[tier] || 0) + 1;
    return acc;
  }, {});
  const provenRoundTrips = allCalls.filter((call) =>
    call.responseSemantics?.isSynchronous || call.responseSemantics?.kind === "reverse_contract"
  ).length;
  const structuralRqRs = allCalls.filter((call) =>
    call.responseSemantics?.kind === "same_payload_rq_rs"
  ).length;
  const confirmedLinks = links.filter((link) => link.confirmed === true).length;
  const unmarkedLinks = links.filter((link) => link.confirmed !== true).length;
  const tinyContracts = allCalls.filter((call) => Number(call.fieldCount || 0) <= 2);
  const divergent = allCalls.filter((call) => call.carrierSource === "divergent_names");
  const processes = state.graph?.processes || [];
  const closedProcesses = processes.filter(processCorpusClosed);
  const strictlyClosedProcesses = processes.filter((process) => process.assemblyComplete !== false);
  const externalBoundaryProcesses = processes.filter((process) => process.closureStatus === "open_external_dependency");
  const internalGapProcesses = processes.filter((process) => process.closureStatus === "internal_gap");
  const incomingContextGapProcesses = processes.filter((process) => process.closureStatus === "incoming_context_gap");
  const unknownGapProcesses = processes.filter((process) => process.closureStatus === "unknown_gap");
  const closedBusinessProcesses = closedProcesses.filter((process) => process.processKind === "business_execution");
  const closedTechnicalProcesses = closedProcesses.length - closedBusinessProcesses.length;
  const cards = assembly.processCount ? [
    [`${closedProcesses.length}/${assembly.processCount}`, `замкнуты в загруженном корпусе · ${strictlyClosedProcesses.length} без внешних границ · ${closedBusinessProcesses.length} бизнес`],
    [externalBoundaryProcesses.length, `останавливаются на незагруженной зависимости · ${internalGapProcesses.length} внутренних разрывов · ${incomingContextGapProcesses.length} без входного пути`],
    [`${assembly.processContractCoveragePct || 0}%`, "найденных переходов размещено в цепочках"],
    [`${data.calls.length} / ${shownUniqueCalls}`, "шагов на диаграмме / уникальных связей"],
    [provenRoundTrips, "синхронных ответов доказано"],
    [`${boundaries.fieldBoundaryCount || 0}/${(boundaries.linkedBoundaryCount || 0) + (boundaries.ambiguousBoundaryCount || 0)}`, "вызовов с прослеживаемыми полями"],
  ] : boundaries.totalObservedBoundaryCount ? [
    [boundaries.totalObservedBoundaryCount, "уникальных исходящих вызовов"],
    [boundaries.linkedBoundaryCount, "получателей подтверждено"],
    [boundaries.ambiguousBoundaryCount, "получателей неоднозначно"],
    [boundaries.candidateBoundaryCount, "получатель только предполагается"],
    [boundaries.unresolvedOutgoingExitCount, "ресивер не найден"],
    [`${boundaries.fieldBoundaryCount}/${(boundaries.linkedBoundaryCount || 0) + (boundaries.ambiguousBoundaryCount || 0)}`, "вызовов с прослеживаемыми полями"],
    [`${data.calls.length} / ${shownUniqueCalls}`, "шагов на диаграмме / уникальных связей"],
    [provenRoundTrips, "синхронных ответов доказано"],
  ] : [
    [`${data.calls.length}/${allCalls.length || 0}`, "показано шагов сценариев"],
    [data.tierCounts.confirmed, "уверенные"],
    [provenRoundTrips, "ответ доказан (round-trip)"],
    [structuralRqRs, "rq+rs в одной модели (не round-trip)"],
    [tierStats.forward || 0, "forward-конвейер (не назад)"],
    [(tierStats.weak || 0) + (tierStats.none || 0), hasTiers ? "ответ не доказан" : "ответ под вопросом"],
    [`${confirmedLinks}/${links.length || 0}`, "подтв. field links"],
    [divergent.length, "имена модели расходятся (rq/rs тип)"],
    [tinyContracts.length, "малых контрактов ≤2 поля"],
  ];
  $("sequence-quality").innerHTML = cards.map(([value, label]) => `
    <div class="quality-card"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>
  `).join("");
  if (unmarkedLinks > 0 && !assembly.processCount) {
    $("sequence-quality").insertAdjacentHTML("beforeend", `
      <div class="quality-card"><strong>${fmt(unmarkedLinks)}</strong><span>неразмеченные field links скрывать в sign-off</span></div>
    `);
  }
}

function setDiagramMode(mode) {
  state.sequence.diagramMode = mode === "process" ? "process" : "sequence";
  state.sequence.selectedStage = null;
  state.sequence.mapStage = null;
  state.sequence.mapView = "overview";
  state.sequence.mapFlow = "all";
  state.sequence.selectedRegionId = "";
  state.sequence.selectedRelationId = "";
  const params = new URLSearchParams(window.location.search);
  if (state.sequence.diagramMode === "process") params.set("diagram", "process");
  else params.delete("diagram");
  params.delete("mapStage");
  params.delete("mapView");
  params.delete("mapFlow");
  window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  renderSequenceView();
}

const processMapController = globalThis.AIProfilerProcessMapController.create({
  state,
  getElement: $,
  esc,
  fmt,
  pluralRu,
  uniq,
  hasNumericValue,
  processNarrativeSummary,
  processClosureLabel,
  transportLabel: globalThis.AIProfilerLabels.transport,
  tierText,
  focusProcess,
  renderSequenceView,
  renderSequenceDetail,
  bindSequenceCanvasInteractions,
  fitSequence,
  setInspectorTab,
  updateAgentContext,
});
const setProcessMapView = processMapController.setView;
const setProcessMapFlow = processMapController.setFlow;
const updateDiagramModeControls = processMapController.updateModeControls;
const renderProcessMapView = processMapController.renderView;
function renderSequenceView() {
  const canvas = $("sequence-canvas");
  if (!state.graph) {
    canvas.innerHTML = `<div class="empty">Граф ещё не загружен.</div>`;
    return;
  }
  const data = buildSequenceData();
  state.sequence.data = data;
  $("seq-zoom-label").textContent = `${Math.round(state.sequence.zoom * 100)}%`;
  const activeProcess = state.sequence.processId
    ? (state.graph?.processes || []).find((p) => p.processId === state.sequence.processId)
    : null;
  updateDiagramModeControls(activeProcess);
  const scopeLabel = state.sequence.scope === "cross"
    ? "только межФП"
    : state.sequence.scope.startsWith("group:")
      ? `внутри ФП ${state.sequence.scope.slice(6)}`
      : "все проверенные связи";
  const shownUniqueCalls = new Set(data.calls.map((call) => call.contractId || call.id)).size;
  $("sequence-summary").innerHTML = state.demo ? [
    `${fmt(data.calls.length)} показанных шагов`,
    `${fmt(shownUniqueCalls)} уникальных подтверждённых связей`,
    "только между ФП",
    "нажмите на карточку, чтобы показать доказательства",
  ].join(" · ") : [
    `${fmt(state.graph.summary?.serviceCount)} сервисов`,
    `${fmt(state.graph.summary?.contractCount)} вариантов связи`,
    activeProcess
      ? `${fmt(data.calls.length)} уникальных вызовов из ${fmt(data.rawStepCount)} найденных в путях исполнения${data.routeFragments.length ? ` · ${fmt(data.routeFragments.length)} ${pluralRu(data.routeFragments.length, "общий фрагмент раскрывается", "общих фрагмента раскрываются", "общих фрагментов раскрываются")} по клику` : ""}`
      : `${fmt(data.calls.length)} шага · ${fmt(shownUniqueCalls)} уникальные связи`,
    state.sequence.confidentOnly ? "только подтверждённые производственные связи" : "все уровни доказательства",
    !activeProcess && state.sequence.completeOnly ? "только цепочки без внутренних разрывов" : "все доказанные цепочки, включая разрывы",
    scopeLabel,
    activeProcess
      ? `<b>процесс: ${esc(activeProcess.name)}</b> <span class="badge ${processCorpusClosed(activeProcess) ? "proof-proven" : "warn"}">${esc(processClosureLabel(activeProcess))}</span> <a href="#" id="seq-clear-process">× сбросить</a>`
      : "↔ = ответ реально возвращается вызывающему (синхронный HTTP или встречный канал)",
  ].join(" · ");
  const contextSections = [];
  if (activeProcess?.processIr) {
    contextSections.push(`
      <section class="process-ir-summary ${activeProcess.processIr.runtimeTraceSafe ? "trace-safe" : "path-union"}">
        <b>${activeProcess.processIr.runtimeTraceSafe && activeProcess.isSingleExecutionPath
          ? "Порядок шагов можно читать как одну трассу выполнения."
          : activeProcess.processIr.runtimeTraceSafe
            ? "Причинный порядок доказан, но параллельные и асинхронные ветки могут завершаться в разном порядке."
            : "Диаграмма объединяет взаимоисключающие и параллельные варианты, а не показывает один запуск."}</b>
        <span>развилки: ${fmt(activeProcess.processIr.summary?.choiceRegionCount || 0)}</span>
        <span>параллельные блоки: ${fmt(activeProcess.processIr.summary?.parallelRegionCount || 0)}</span>
        <span>асинхронные задачи: ${fmt(activeProcess.processIr.summary?.asyncTaskRegionCount || 0)}</span>
        <span>циклы: ${fmt(activeProcess.processIr.summary?.loopRegionCount || 0)}</span>
        <span>без доказанной позиции: ${fmt(activeProcess.processIr.summary?.unsequencedNodeCount || 0)}</span>
      </section>`);
  }
  if (activeProcess?.narrative) {
    contextSections.push(`
      <section class="process-context-card process-narrative">
        <div class="process-context-head">
          <b>${activeProcess.narrativeSource === "curated_registry" ? "Объяснение по коду и реестру ИВ" : "Объяснение по фактам кода"}</b>
          <span>${fmt(activeProcess.narrativeCitations?.length || 0)} оснований</span>
        </div>
        <p>${esc(processNarrativeSummary(activeProcess.narrative))}</p>
        ${activeProcess.narrativeGaps?.length ? `<details class="ai-evidence">
          <summary>Незакрытые выходы: ${fmt(activeProcess.narrativeGaps.length)}</summary>
          <ul>${activeProcess.narrativeGaps.map((gap) => `<li>${esc(gap)}</li>`).join("")}</ul>
        </details>` : ""}
      </section>`);
  }
  const gapResearch = activeProcess?.unresolvedBoundaryResearch || [];
  if (gapResearch.length) {
    contextSections.push(`
      <section class="process-context-card process-gap-research">
        <div class="process-context-head">
          <b>Проверка незакрытых физических выходов</b>
          <span>${fmt(gapResearch.filter((item) => item.codeEvidenceVerified).length)} из ${fmt(gapResearch.length)} проверено по коду</span>
        </div>
        <details class="ai-evidence">
          <summary>Результаты чтения кода · ${fmt(gapResearch.length)}</summary>
          <ul>${gapResearch.map((item) => `
            <li>
              <b>${esc(processResearchClassificationLabel(item.classification))}.</b>
              ${esc(item.summary || "Кода недостаточно для содержательного объяснения.")}
              ${item.candidateTarget?.serviceId ? ` Возможный получатель: <b>${esc(sequenceServiceName(item.candidateTarget.serviceId))}</b>, связь пока не доказана.` : ""}
              ${(item.missingEvidence || []).length ? `<span class="muted"> Не хватает: ${esc(item.missingEvidence.join("; "))}</span>` : ""}
            </li>
          `).join("")}</ul>
        </details>
      </section>`);
  }
  $("sequence-context").innerHTML = contextSections.join("");
  const clearLink = $("seq-clear-process");
  if (clearLink) clearLink.onclick = (event) => { event.preventDefault(); clearProcessFocus(); };
  renderSequenceQuality(data);

  if (state.sequence.diagramMode === "process") {
    state.sequence.selectedFragmentId = "";
    renderProcessMapView(activeProcess, data);
    return;
  }
  state.sequence.processMapData = null;

  if (!data.calls.length) {
    canvas.innerHTML = `<div class="empty">Под текущий фильтр не попало ни одного вызова.</div>`;
    $("sequence-detail").innerHTML = `<div class="empty">Выберите другой фильтр или отключите “только уверенные”.</div>`;
    return;
  }
  if (!state.sequence.selectedId || !data.calls.some((call) => call.id === state.sequence.selectedId)) {
    state.sequence.selectedId = data.calls[0].id;
  }
  updateAgentContext();
  if (!data.routeFragments.some((fragment) => fragment.id === state.sequence.selectedFragmentId)) {
    state.sequence.selectedFragmentId = "";
  }

  const lifelineTop = 66 * data.scale;
  const stage = `
    <div class="sequence-stage" style="width:${data.width}px;height:${data.height}px">
      <div class="sequence-sticky-services" style="width:${data.width}px;height:${lifelineTop}px">
        ${data.participants.map((part) => `
          <div class="seq-service ${String(part.id).startsWith("ext:") ? "ghost" : ""}" style="left:${part.x - part.labelW / 2}px;width:${part.labelW}px" title="${esc(part.id)}${String(part.id).startsWith("ext:") ? " — внешняя система, кода в корпусе нет" : ""}">
            <strong>${esc(part.label)}</strong>
          </div>
        `).join("")}
      </div>
      ${data.participants.map((part) => `
        <div class="seq-lifeline" style="left:${part.x}px;top:${lifelineTop}px;height:${data.height - lifelineTop - 14}px"></div>
      `).join("")}
      ${data.calls.filter((call) => call.processBreak).map((call) => `
        <div class="seq-proc-divider" style="top:${call.y - 26 * data.scale}px;width:${data.width - 24}px">
          <span>процесс: ${esc(call.processBreak)}</span>
        </div>
      `).join("")}
      ${data.routeFragments.map((fragment) => renderSequenceFragment(fragment)).join("")}
      ${data.calls.map((call) => renderSeqCall(call, data.scale)).join("")}
    </div>
  `;
  canvas.innerHTML = stage;
  bindSequenceCanvasInteractions();
  renderSequenceDetail();
}

function fragmentTagLabel(tag) {
  return {
    opt: "условие",
    par: "параллельно",
    loop: "цикл",
    break: "аварийная ветка",
  }[tag] || tag;
}

function renderSequenceFragment(fragment) {
  const selected = fragment.id === state.sequence.selectedFragmentId ? "selected" : "";
  const uniqueCallCount = (fragment.callIds || []).length;
  const occurrenceCount = uniqueCallCount + Number(fragment.hiddenOccurrenceCount || 0);
  const rawRange = fragment.rawStepMin
    ? `raw-появления ${fragment.rawStepMin}${fragment.rawStepMax !== fragment.rawStepMin ? `–${fragment.rawStepMax}` : ""}`
    : "raw-номера доступны в деталях";
  const tags = (fragment.semanticTags || []).map((tag) => `<span>${esc(tag)} · ${esc(fragmentTagLabel(tag))}</span>`).join("");
  return `
    <div class="seq-fragment ${selected}" data-fragment-id="${esc(fragment.id)}"
         style="left:${fragment.x}px;top:${fragment.y}px;width:${fragment.width}px;height:${fragment.height}px">
      <button class="seq-fragment-tab" type="button" title="Открыть маршруты, условия и объяснение схлопывания">
        <b>ref</b>
        <span>${fmt(uniqueCallCount)} ${pluralRu(uniqueCallCount, "вызов", "вызова", "вызовов")} общие для ${fmt(fragment.routeCount)} ${pluralRu(fragment.routeCount, "пути", "путей", "путей")}</span>
        <small>${esc(rawRange)} · показано ${fmt(uniqueCallCount)} из ${fmt(occurrenceCount)} появлений</small>
      </button>
      <div class="seq-fragment-tags">${tags}</div>
    </div>
  `;
}

function renderSeqCall(call, scale) {
  const same = call.x1 === call.x2;
  const reverse = call.x2 < call.x1;
  const left = Math.min(call.x1, call.x2);
  const width = Math.max(96 * scale, Math.abs(call.x2 - call.x1));
  const lineLeft = same ? call.x1 : left;
  const arrowClass = reverse ? "reverse" : "forward";
  const selected = call.id === state.sequence.selectedId ? "selected" : "";
  const irKinds = new Set(call.processIr?.regionKinds || []);
  const irClasses = [
    irKinds.has("choice") || irKinds.has("guard") ? "ir-choice" : "",
    irKinds.has("parallel") || irKinds.has("async_task") ? "ir-parallel" : "",
    irKinds.has("loop") ? "ir-loop" : "",
    irKinds.has("exception") ? "ir-exception" : "",
    call.processIr?.unsequenced ? "ir-unsequenced" : "",
  ].filter(Boolean).join(" ");
  // rq+rs у МОДЕЛИ ≠ двусторонний ВЫЗОВ: на kafka-конвейере конверт с rq+rs секциями едет
  // только вперёд. Стрелку ↔ заслуживает лишь реальный возврат вызывающему.
  const trulyBidirectional = call.responseSemantics?.isSynchronous || call.responseSemantics?.kind === "reverse_contract";
  const dir = call.direction === "rq+rs" ? (trulyBidirectional ? "запрос + ответ" : "запрос и ответ в одной модели, поток вперёд") : directionLabel(call.direction);
  const proofTierLabels = { proven: "ответ доказан", forward: "поток вперёд", weak: "ответ слабый", none: "ответа нет" };
  if (call.responseSemantics?.kind === "same_payload_rq_rs") {
    proofTierLabels.proven = "rq+rs в модели";
  }
  if (call.isBridge) {
    return `
      <div class="seq-call ${selected} tier-external forward"
           data-call-id="${esc(call.id)}"
           style="left:${lineLeft}px;top:${call.y}px;width:${width}px;--seq-card-scale:${scale}">
        <div class="seq-call-line"></div>
        <div class="seq-call-card" title="${esc(call.sourceService)} → внешняя система «${esc(call.bridge.likelyTarget || "?")}» — ресивера в корпусе нет">
          <strong>⋯ ${esc(call.sourceLabel)} → ${esc(call.targetLabel)}</strong>
          <span>${esc(call.payload)} · ${esc(transportLabel(call.transport))}</span>
          <div class="seq-badges">
            <span class="badge warn">внешний мост</span>
            <span class="badge warn">кода нет</span>
            ${(call.bridge.matchedServiceFamily || []).length ? `<span class="badge">похоже на: ${esc(sequenceServiceName(call.bridge.matchedServiceFamily[0]))}…</span>` : ""}
          </div>
        </div>
      </div>
    `;
  }
  const badges = [
    call.order ? `<span class="badge">этап ${fmt(call.order.stage)}</span>` : `<span class="badge warn">вне процесса</span>`,
    call.order?.readiness ? `<span class="badge proof-proven">готовность ${fmt(call.order.readiness.score)}/100</span>` : "",
    irKinds.has("choice") || irKinds.has("guard")
      ? `<span class="badge ir-choice-badge" title="Показывает, из каких веток условия этот переход достижим">${esc(processBranchLabel(call.processIr.branchLabels))}</span>`
      : "",
    irKinds.has("parallel")
      ? `<span class="badge ir-parallel-badge" title="Несколько задач запущены параллельно; порядок их завершения не доказан">параллельные задачи</span>`
      : irKinds.has("async_task")
        ? `<span class="badge ir-parallel-badge" title="Шаг выполняется внутри одной асинхронной задачи; внутренний порядок задают причинные связи">внутри async-задачи</span>`
        : "",
    call.processIr?.unsequenced
      ? `<span class="badge warn" title="Причинная зависимость от предыдущей карточки не найдена">позиция не доказана</span>`
      : "",
    BRANCH_ORDERINGS.has(call.order?.ordering) ? `<span class="badge" title="Это отдельная ветка или продолжение. Вертикальное положение не означает, что соседние карточки выполняются подряд">⇅ ветка: ${esc(call.order.ordering)}</span>` : "",
    call.variantCount > 1 ? `<span class="badge" title="Один и тот же вызов встречается в нескольких маршрутах исполнения; это не повторная отправка подряд">в ${fmt(call.variantCount)} путях</span>` : "",
    `<span class="badge">${esc(tierText(call.tier))}</span>`,
    call.proofTier ? `<span class="badge proof-${esc(call.proofTier)}">${esc(proofTierLabels[call.proofTier] || call.proofTier)}</span>` : "",
    (call.contract?.negativeEvidence || []).length ? `<span class="badge warn">⚠ есть контрдоказательства</span>` : "",
    call.presentationExcluded
      ? `<span class="badge warn" title="${esc(call.presentationExclusionReason)}">исключено из показа</span>`
      : "",
    call.carrierSource === "divergent_names" ? `<span class="badge warn">имена модели расходятся</span>` : "",
    call.carrierSource === "source_only" ? `<span class="badge warn">модель только у источника</span>` : "",
    call.fieldCount
      ? `<span class="badge">${fmt(call.fieldCount)} связей полей</span>`
      : (call.sourceFieldCount || call.targetFieldCount)
        ? `<span class="badge warn">структура ${fmt(call.sourceFieldCount)}→${fmt(call.targetFieldCount)}, совпадений нет</span>`
        : `<span class="badge warn">структура не раскрыта</span>`,
    call.targetSourceRefCount ? `<span class="badge">${fmt(call.targetSourceRefCount)} ссылок</span>` : `<span class="badge warn">нет refs</span>`,
  ].filter(Boolean).join("");
  return `
    <div class="seq-call ${selected} tier-${esc(call.tier)} ${arrowClass} ${irClasses} ${(call.responseSemantics?.isSynchronous || call.responseSemantics?.kind === "reverse_contract") ? "bidir" : ""}"
         data-call-id="${esc(call.id)}"
         style="left:${lineLeft}px;top:${call.y}px;width:${width}px;--seq-card-scale:${scale}">
      <div class="seq-call-line"></div>
      ${call.responseSemantics?.isSynchronous ? `<div class="seq-call-return ${reverse ? "forward" : "reverse"}"><span>‹ ответ (sync)</span></div>` : ""}
      <div class="seq-call-card" title="${esc(call.sourceService)} → ${esc(call.targetService)}${call.order ? ` · восстановленный шаг ${call.order.step} процесса «${esc(call.order.processName || call.order.processId)}»` : ""}${BRANCH_ORDERINGS.has(call.order?.ordering) ? " · это отдельная ветка; соседние карточки не обязаны выполняться подряд" : ""}">
        <strong>${call.order ? `№${fmt(call.step)}${call.displayStep !== call.step ? ` · исх.${fmt(call.displayStep)}` : ""}` : fmt(call.step)} ${esc(call.sourceLabel)} → ${esc(call.targetLabel)}</strong>
        <span>${esc(call.payload)}${dir !== "unknown" ? ` · ${esc(dir)}` : ""}</span>
        <span>${esc(transportLabel(call.transport))} · ${esc(contractProofLabel(call.proof))} · ${esc(qualityTierLabel(call.qualityTier))}</span>
        <div class="seq-badges">${badges}</div>
      </div>
    </div>
  `;
}

function controlContextText(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return value.label || value.condition || value.guard || value.expression || value.kind || value.type || "";
}

function renderSequenceFragmentDetail(fragment) {
  const data = state.sequence.data;
  const calls = fragment.callIds.map((id) => data?.calls.find((call) => call.id === id)).filter(Boolean);
  const occurrenceCount = calls.length + Number(fragment.hiddenOccurrenceCount || 0);
  const callList = calls.map((call) => `<li><b>${esc(call.sourceLabel)} → ${esc(call.targetLabel)}</b><span>${esc(call.payload)}</span></li>`).join("");
  const routeList = fragment.variants.map((variant, index) => {
    const contexts = uniq(variant.occurrences.flatMap((occurrence) => [
      ...(occurrence.controlContext || []),
      ...(occurrence.inheritedControlContext || []),
      ...(occurrence.conditionalContext || []),
      ...(occurrence.loopContext || []),
      ...(occurrence.exceptionContext || []),
    ]).map(controlContextText).filter(Boolean));
    const sources = uniq(variant.occurrences.map((occurrence) =>
      occurrence.sourceFile ? `${occurrence.sourceFile}${occurrence.sourceLine ? `:${occurrence.sourceLine}` : ""}` : ""
    ).filter(Boolean));
    return `
      <details class="route-variant" ${index === 0 ? "open" : ""}>
        <summary>Путь ${fmt(index + 1)} · исходные шаги ${esc(variant.rawSteps.join(", ") || "не указаны")}</summary>
        <p class="mono">${esc(variant.routeId)}</p>
        ${contexts.length ? `<p><b>Условия:</b> ${esc(contexts.join("; "))}</p>` : `<p class="muted">Условие не подписано в снимке; точный route ID сохранён.</p>`}
        ${sources.length ? `<p><b>Код:</b> <span class="mono">${esc(sources.join("; "))}</span></p>` : ""}
      </details>
    `;
  }).join("");
  $("sequence-detail").innerHTML = `
    <span class="fragment-kind">ref</span>
    <h3>Общий фрагмент: ${fmt(calls.length)} ${pluralRu(calls.length, "вызов", "вызова", "вызовов")} в ${fmt(fragment.routeCount)} ${pluralRu(fragment.routeCount, "пути", "путях", "путях")}</h3>
    <p><b>Это не несколько последовательных повторов одного запуска.</b> Анализатор нашёл ${fmt(fragment.routeCount)} статических ${pluralRu(fragment.routeCount, "маршрут", "маршрута", "маршрутов")}, в которых присутствует один и тот же набор из ${fmt(calls.length)} физических ${pluralRu(calls.length, "вызова", "вызовов", "вызовов")}.</p>
    <p>Без схлопывания диаграмма содержала бы ${fmt(occurrenceCount)} появлений этих контрактов. UI показывает ${fmt(calls.length)}, а остальные ${fmt(fragment.hiddenOccurrenceCount)} считает повторными появлениями тех же вызовов в других путях.</p>
    <p class="muted">Raw-номера ${esc(fragment.rawStepMin || "—")}${fragment.rawStepMax && fragment.rawStepMax !== fragment.rawStepMin ? `–${esc(fragment.rawStepMax)}` : ""} — внутренняя нумерация появлений после разворачивания всех путей. Это не строки Java, не время выполнения и не шаги одного production-запуска.</p>
    <div class="kv">
      <span>Статических маршрутов</span><b>${fmt(fragment.routeCount)}</b>
      <span>Физических вызовов показано</span><b>${fmt(calls.length)}</b>
      <span>Появлений до схлопывания</span><b>${fmt(occurrenceCount)}</b>
      <span>Скрыто повторных появлений</span><b>${fmt(fragment.hiddenOccurrenceCount)}</b>
      <span>Raw-номера появлений</span><b>${esc(fragment.rawSteps.join(", ") || "—")}</b>
      <span>Семантика UML</span><b>${esc(["ref", ...(fragment.semanticTags || [])].join(" + "))}</b>
    </div>
    <div class="execution-semantics">
      <b>Как читать рамку</b>
      <span><b>ref</b> — общий подпроцесс, который встречается в нескольких статических маршрутах и показан один раз.</span>
      ${(fragment.semanticTags || []).includes("opt") ? "<span><b>opt</b> — выполняется только при указанном условии.</span>" : ""}
      ${(fragment.semanticTags || []).includes("par") ? "<span><b>par</b> — соседние действия могут выполняться параллельно; их вертикальный порядок не равен времени завершения.</span>" : ""}
      ${(fragment.semanticTags || []).includes("loop") ? "<span><b>loop</b> — фрагмент может повторяться в цикле.</span>" : ""}
      ${(fragment.semanticTags || []).includes("break") ? "<span><b>break</b> — аварийная ветка прекращает обычный сценарий.</span>" : ""}
    </div>
    <div class="detail-section"><h3>Вызовы фрагмента</h3><ul class="fragment-call-list">${callList}</ul></div>
    <div class="detail-section"><h3>Входные пути и условия</h3>${routeList}</div>
  `;
}

function renderSequenceDetail() {
  const data = state.sequence.data;
  const fragment = data?.routeFragments?.find((item) => item.id === state.sequence.selectedFragmentId);
  if (fragment) {
    renderSequenceFragmentDetail(fragment);
    return;
  }
  const call = state.sequence.processMapData?.callById?.get(state.sequence.selectedId)
    || data?.calls.find((item) => item.id === state.sequence.selectedId);
  if (!call) {
    $("sequence-detail").innerHTML = `<div class="empty">Выберите стрелку на диаграмме.</div>`;
    return;
  }
  if (!call.isBridge && state.graphMode === "sequence" && call.contractId && !call.contract?.detailLoaded) {
    $("sequence-detail").innerHTML = `
      <h3>${esc(call.sourceLabel)} → ${esc(call.targetLabel)}</h3>
      <p class="muted">Загружаю поля и доказательства выбранного контракта…</p>
    `;
    loadSequenceContractDetail(call);
    return;
  }
  if (call.isBridge) {
    const bridge = call.bridge || {};
    $("sequence-detail").innerHTML = `
      <h3>${esc(call.sourceLabel)} → внешняя система «${esc(bridge.likelyTarget || "?")}»</h3>
      <p class="muted">Кодовое намерение: клиент в исходниках есть, ресивера в корпусе нет. Связь не доказана и не опровергнута.</p>
      <div class="kv">
        <span>Транспорт</span><b>${esc(transportLabel(bridge.transportKind))}</b>
        <span>Выходов в коде</span><b>${fmt(bridge.exitCount)}</b>
        <span>Похожие сервисы корпуса</span><b>${esc((bridge.matchedServiceFamily || []).map(sequenceServiceName).slice(0, 5).join(", ") || "—")}</b>
      </div>
      <div class="detail-section">
        <h3>Payload-типы</h3>
        <div class="field-list">${(bridge.payloadTypes || []).slice(0, 20).map((p) => `<span class="field-chip">${esc(p)}</span>`).join("") || `<span class="muted">—</span>`}</div>
      </div>
      <div class="detail-section">
        <h3>Точки выхода в коде</h3>
        ${(bridge.sampleExitIds || []).slice(0, 6).map((x) => `<p class="mono" style="font-size:11px;word-break:break-all">${esc(x)}</p>`).join("") || `<p class="muted">—</p>`}
      </div>
      <p class="muted">${esc(bridge.note || "")}</p>
    `;
    return;
  }
  const allCalls = buildSequenceData(1, { applyFilters: false }).calls;
  const response = responseEvidence(call, allCalls);
  const fields = call.fields.slice(0, 80).map((field) => `<span class="field-chip">${esc(field)}</span>`).join("");
  const sourceFields = (call.sourceFields || []).slice(0, 80).map((field) => `<span class="field-chip">${esc(field)}</span>`).join("");
  const targetFields = (call.targetFields || []).slice(0, 80).map((field) => `<span class="field-chip">${esc(field)}</span>`).join("");
  const responseCompatibility = call.responsePayloadCompatibility || {};
  const httpVariant = call.sourceHttpOperationVariant || {};
  const responseCompatibilityLabels = {
    exact: "точное совпадение",
    compatible_name: "совместимые имена",
    compatible_fields: "совместимые поля",
    serialized_document: "ответ доставлен как сериализованный документ",
    conflict: "конфликт типов",
    body_not_consumed: "тело ответа намеренно не читается",
    missing_source: "клиентский тип не найден",
    missing_target: "тип endpoint не найден",
    unavailable: "нет данных",
  };
  const contracts = call.contracts.slice(0, 6).map((contract) => `
    <tr>
      <td>${esc(contractProofLabel(contract.proofLevel))}</td>
      <td>${fmt(contract.sharedFieldCount)}</td>
      <td>${esc((contract.sharedPayloadTypes || []).join(", "))}</td>
      <td>${contract.confirmed ? "да" : "нет"}</td>
    </tr>
  `).join("");
  const xlsxContract = call.contracts.find((contract) => contractMapping(contract).href);
  const xlsxHref = contractMapping(xlsxContract).href || "";
  const xlsxCoverage = contractMapping(xlsxContract);
  const exactContract = call.contract || call.contracts[0] || {};
  const registryRefs = exactContract.architectureRegistryRefs || [];
  const registryBlock = registryRefs.length ? `
    <div class="detail-section">
      <h3>Архитектурный реестр</h3>
      ${registryRefs.map((ref) => `
        <p><b>${esc(ref.interactionCode || "Строка реестра")}</b> · ${esc(ref.name || "")}</p>
        <p class="muted">Направление данных: ${esc(ref.providerComponent || "?")} → ${esc(ref.consumerComponent || "?")}. Оно может быть обратным направлению синхронного HTTP-запроса.</p>
        ${(ref.sourceRefs || []).map((source) => `<p class="mono">${esc(source.file || "")} · ${esc(source.sheet || "лист ?")} · строка ${fmt(source.row)}</p>`).join("")}
      `).join("")}
      <p class="muted">Реестр задаёт ожидаемую бизнес-связь, но не повышает уровень доказательства без кода или конфигурации.</p>
    </div>` : "";
  const contractResponseUsage = call.responseUsageEvidence || exactContract.responseUsageEvidence || {};
  const contractResponseUsageLabels = {
    parsed_and_consumed: "документ разобран и передан дальше; чтение отдельных полей ещё не доказано",
    parsed: "документ разобран; последующий получатель результата не найден",
    consumed_locally: "ответ использован локально",
    returned_to_caller: "ответ возвращён на уровень выше",
    bound_not_consumed: "ответ присвоен, но дальнейшее использование не найдено",
  };
  const mappingUrl = mappingViewUrl(call.contractId || exactContract.contractId);
  const fieldJourneyRows = (exactContract.sharedFieldDetails || []).flatMap((detail) => {
    const sourcePaths = detail.sourcePaths || [];
    const targetPaths = detail.targetPaths || [];
    const rowCount = Math.max(sourcePaths.length, targetPaths.length, 1);
    return Array.from({ length: rowCount }, (_, index) => `
      <tr>
        <td><b>${esc(call.sourceLabel)}</b><div class="mono">${esc(sourcePaths[index] || sourcePaths[0] || detail.field || "?")}</div></td>
        <td class="journey-arrow">→</td>
        <td><b>${esc(call.targetLabel)}</b><div class="mono">${esc(targetPaths[index] || targetPaths[0] || detail.field || "?")}</div></td>
        <td>${esc(detail.field || "")}</td>
      </tr>
    `);
  }).join("");
  const order = call.order;
  const responseLineage = order?.responseLineage || {};
  const eventIdentityEvidence = order?.eventIdentity?.evidence || [];
  const responseUsageLabels = {
    consumed_locally: "ответ использован дальше в коде вызывающего сервиса",
    returned_to_caller: "ответ возвращён ещё на один уровень выше",
    bound_not_consumed: "ответ присвоен переменной, дальнейшее использование не найдено",
    not_observed: "использование тела ответа в вызывающем коде не доказано",
  };
  const responseBindings = (responseLineage.bindings || [])
    .map((item) => `${item.variable || "?"}${item.model ? `: ${item.model}` : ""} @${item.line || "?"}`)
    .join(", ");
  const responseConsumers = (responseLineage.consumers || [])
    .map((item) => {
      const params = (item.parameterBindings || [])
        .map((binding) => `${binding.parameterName || "?"}: ${binding.parameterModel || "?"}`)
        .join(", ");
      const results = (item.resultBindings || [])
        .map((binding) => `${binding.variable || "?"}: ${binding.model || "?"}`)
        .join(", ");
      return `${item.receiver ? `${item.receiver}.` : ""}${item.method || "?"}(${params || "..."}) @${item.line || "?"}${results ? ` -> ${results}` : ""}`;
    })
    .join(", ");
  const stepReadiness = order?.readiness;
  const guardBlock = (call.guardConditions || []).length ? `
    <div class="process-map-guard-detail">
      <b>Условия выполнения блока</b>
      ${(call.guardConditions || []).map((guard) => `
        <div>
          <span>${guard.branch === "else" ? "иначе, когда условие не выполнено" : "если условие выполнено"}</span>
          <code>${esc(guard.condition)}</code>
          <small>${esc(guard.ownerMethodId || "метод не указан")}${guard.sourceLine ? ` · строка ${fmt(guard.sourceLine)}` : ""}</small>
        </div>`).join("")}
    </div>` : "";
  const mapExecutionBlock = call.executionLabel ? `
    <div class="process-map-detail-execution kind-${esc(call.flowKind || "main")}">
      <b>Как выполняется</b>
      <span>${esc(call.executionLabel)}</span>
      ${call.flowKind === "exception"
        ? "<small>Этот вызов не относится к обычному пути: он выполняется только после перехода в обработчик исключения.</small>"
        : call.flowKind === "async"
          ? "<small>Вызов выполняется в отдельно запущенной задаче. Связи внутри неё показывают доказанный порядок, а не время выполнения.</small>"
          : "<small>Зелёные связи показывают доказанный порядок или причинное продолжение основного пути.</small>"}
    </div>` : "";
  const orderBlock = order ? `
    <div class="detail-section">
      <h3>Порядок вызова</h3>
      ${mapExecutionBlock}
      ${guardBlock}
      ${stepReadiness ? `<p><span class="badge proof-proven">Готовность шага ${fmt(stepReadiness.score)}/100 · ${esc(readinessStatusLabel(stepReadiness.status))}</span>${stepReadiness.integrationScope === "cross_source_group" ? ` <span class="badge">межФП</span>` : ""}</p>` : ""}
      <div class="kv">
        <span>Процесс</span><b>${esc(order.processName || order.processId || "—")}</b>
        <span>Показанный шаг</span><b>${fmt(call.displayStep || call.step || order.step)} (этап ${fmt(order.stage)})</b>
        <span>Исходный шаг</span><b>${fmt(order.step)}</b>
        <span>Входных путей</span><b>${fmt(call.variantCount || 1)}${call.variantCount > 1 ? " — один вызов, не повторы подряд" : ""}</b>
        <span>После</span><span class="mono">${order.processIr?.predecessorDisplayIndex
          ? `шаг ${fmt(order.processIr.predecessorDisplayIndex)}`
          : esc(order.afterEdgeId || "— (старт процесса)")}</span>
        ${order.handoffInstanceIdentity ? `
          <span>Этот переход</span><b>${esc(processIdentityLabel(order.handoffInstanceIdentity))}</b>
          <span>Цепочка от входа</span><b>${esc(processIdentityLabel(order.processInstanceIdentity))}</b>
          ${order.handoffInstanceIdentity === "independent_event" ? `
            <span>Почему это новое событие</span><b>${eventIdentityEvidence.length
              ? esc(eventIdentityEvidence.map((item) => `${item.field || "ID"} <- ${item.generator || item.sourceExpression || "generator"} @${item.line || "?"}`).join(", "))
              : "найдено создание нового сквозного идентификатора"}</b>
          ` : ""}
          <span>Сквозные идентификаторы</span><b>${esc((order.correlationFields || []).join(", ") || "не найдены")}</b>
        <span>Whole-object перенос</span><b>${order.entryPayloadPassthrough ? "доказан по аргументам вызовов" : "не доказан"}</b>
          <span>Что стало с ответом</span><b>${esc(responseUsageLabels[order.responseUsageStatus] || order.responseUsageStatus || "не исследовано")}</b>
          ${responseBindings ? `<span>Переменная ответа</span><b class="mono">${esc(responseBindings)}</b>` : ""}
          ${responseConsumers ? `<span>Куда передан ответ</span><b class="mono">${esc(responseConsumers)}</b>` : ""}
        ` : ""}
      </div>
      ${order.processIr ? `<div class="execution-semantics">
        <b>Как читать этот шаг</b>
        <span>${order.processIr.unsequenced
          ? "Позиция относительно соседней карточки не доказана кодом."
          : order.processIr.causalRelations?.length
            ? `Есть ${fmt(order.processIr.causalRelations.length)} ${pluralRu(order.processIr.causalRelations.length, "доказанная причинная зависимость", "доказанные причинные зависимости", "доказанных причинных зависимостей")}.`
            : "Это входной шаг или начало независимой ветки."}</span>
        ${call.flowKind === "exception"
          ? "<span>Ветка выполняется только после исключения; обычный путь её обходит.</span>"
          : (order.processIr.regionKinds || []).includes("choice") || (order.processIr.regionKinds || []).includes("guard")
          ? `<span>Выбрана ${esc(processBranchLabel(order.processIr.branchLabels))}; точные проверки перечислены выше.</span>`
          : ""}
        ${(order.processIr.regionKinds || []).includes("parallel")
          ? "<span>Параллельные задачи: порядок их завершения не доказан.</span>"
          : (order.processIr.regionKinds || []).includes("async_task")
            ? "<span>Шаг выполняется внутри одной асинхронной задачи; порядок внутри неё задают показанные причинные связи.</span>"
            : ""}
      </div>` : ""}
      <p class="muted">${esc(orderReasonLabel(order.reason || ""))}</p>
      ${order.purpose
        ? `<p><b>${order.purposeSource === "curated_registry" ? "Зачем (проверено по коду и реестру ИВ):" : "Зачем (объяснение ИИ):"}</b> ${esc(order.purpose)}</p>
          <p class="muted">${order.purposeSource === "curated_registry" ? "Основание" : "Основание ИИ"}: ${fmt(order.purposeCitations?.length || 0)} проверенных фактов.</p>
          ${order.purposeCitations?.length ? `<details class="ai-evidence">
            <summary>Показать факты, на которых основано объяснение</summary>
            <ul>${order.purposeCitations.map((citation) => `<li><span class="mono">${esc(citation.factId)}</span> ${esc(citation.evidence)}</li>`).join("")}</ul>
          </details>` : ""}
          ${(order.purposeGaps || []).map((gap) => `<p class="muted">Не подтверждено: ${esc(gap)}</p>`).join("")}`
        : `<p class="muted">Бизнес-назначение шага не рассчитано в этом снимке.</p>`}
      ${call.variantCount > 1 ? `<details class="route-variant-list">
        <summary>Показать ${fmt(call.variantCount)} входных путей этого вызова</summary>
        ${(call.routeVariants || []).map((variant, index) => {
          const contexts = uniq([
            ...(variant.controlContext || []),
            ...(variant.inheritedControlContext || []),
            ...(variant.conditionalContext || []),
            ...(variant.loopContext || []),
            ...(variant.exceptionContext || []),
          ].map(controlContextText).filter(Boolean));
          return `<p><b>Путь ${fmt(index + 1)}</b> · исходный шаг ${fmt(variant.rawStep)}<br><span class="mono">${esc(variant.routeId || "route ID не указан")}</span>${contexts.length ? `<br>${esc(contexts.join("; "))}` : ""}</p>`;
        }).join("")}
      </details>` : ""}
    </div>` : `
    <div class="detail-section">
      <h3>Порядок вызова</h3>
      <p class="muted">Ребро не входит ни в один процесс — позиция в сиквенсе не восстановлена.</p>
    </div>`;
  $("sequence-detail").innerHTML = `
    <h3>${esc(call.sourceLabel)} → ${esc(call.targetLabel)}</h3>
    <p class="muted">${esc(tierText(call.tier))} связь · ${esc(transportLabel(call.transport))}</p>
    <div class="mapping-actions">
      <a class="mini-btn" href="${esc(mappingUrl)}">Открыть маппинг этой связи (${call.fieldCount ? `${fmt(call.fieldCount)} пар полей` : Number(xlsxCoverage.rowCount) ? `${fmt(xlsxCoverage.rowCount)} строк инвентаризации` : "поля не раскрыты"})</a>
    </div>
    ${orderBlock}
    ${registryBlock}
    ${xlsxHref
      ? `<p class="muted"><b>Полнота Excel:</b> ${esc(mappingCoverageLabel(xlsxCoverage))} · ${esc(mappingDirectionsLabel(xlsxCoverage))}</p>
        <a class="mini-btn wide" href="${fileUrl(xlsxHref)}" target="_blank" rel="noreferrer">⬇ Открыть Excel маппинга</a>`
      : `<p class="muted"><b>Excel-маппинг:</b> для этого контракта пока не восстановлено ни одной пары полей.</p>`}
    <div class="kv">
      <span>Передаваемая модель</span><b>${esc(call.payload)}</b>
      <span>Направление</span><b>${esc(directionLabel(call.direction))}</b>
      ${exactContract.sourceTransportBindingId ? `
        <span>Логический binding</span><b class="mono">${esc(exactContract.sourceTransportBindingId)}</b>
        <span>Физический канал</span><b>${esc(exactContract.sourceTransportAddress || "не найден в загруженной конфигурации")}</b>
      ` : ""}
      <span>Почему связь принята</span><b>${esc(contractProofLabel(call.proof))}</b>
      <span>Качество доказательства</span><b>${esc(qualityTierLabel(call.qualityTier))}</b>
      <span>Мест в коде</span><b>${fmt(call.targetSourceRefCount)}</b>
      ${httpVariant.caller_class ? `
        <span>Место HTTP-вызова</span><b class="mono">${esc(`${httpVariant.caller_class}.${httpVariant.caller_method || "?"}@${httpVariant.line || 0}`)}</b>
        <span>HTTP операция</span><b>${esc([httpVariant.method, httpVariant.path || httpVariant.path_expression].filter(Boolean).join(" ") || "—")}</b>
        <span>Объект запроса</span><b>${esc(httpVariant.request_object_type || "—")}</b>
        <span>Бизнес-модель запроса</span><b>${esc(httpVariant.request_body_type || "—")}</b>
      ` : ""}
      <span>Ответ</span><b>${call.responseSemantics?.isSynchronous ? "возвращается вызывающему" : "не доказан"}</b>
      <span>Доказательство ответа</span><b>${esc(responseProofLabel(call.responseSemantics?.kind || response.kind))}</b>
      <span>Модель ответа у клиента</span><b>${esc((call.sourceResponsePayloadTypes || []).join(", ") || "—")}</b>
      <span>Модель ответа у получателя</span><b>${esc((call.targetResponsePayloadTypes || []).join(", ") || "—")}</b>
      <span>Совместимость моделей ответа</span><b>${esc(responseCompatibilityLabels[responseCompatibility.status] || responseCompatibility.status || "—")}</b>
      ${contractResponseUsage.status ? `<span>Обработка ответа в клиенте</span><b>${esc(contractResponseUsageLabels[contractResponseUsage.status] || contractResponseUsage.status)}</b>` : ""}
      <span>Модель</span><b>${call.carrierSource === "divergent_names"
        ? `${esc(call.payload)} ~&gt; ${esc(call.carrierTarget || "?")} (имена расходятся)`
        : (call.carrierSource === "source_only" ? "только у источника" : call.carrierSource === "shared" ? "совпадает у отправителя и получателя" : esc(call.carrierSource || "—"))}</b>
      <span>Синхронный ответ</span><b>${call.responseSemantics?.isSynchronous ? "да" : "нет"}</b>
      <span>Итог проверки</span><b>${esc(claimStatusLabel(exactContract.evidenceClaim?.status || call.edge?.evidenceClaim?.status))}</b>
      <span>Технический ID связи</span><span class="mono">${esc(call.contractId || call.id)}</span>
    </div>
    ${(exactContract.negativeEvidence || []).map((ne) => `
    <p class="badge warn" style="display:block">⚠ Контрдоказательство: ${esc(ne.kind || "расхождение доказательств")}${ne.sourcePayload || ne.targetPayload ? ` — ${esc(ne.sourcePayload || "?")} vs ${esc(ne.targetPayload || "?")}` : ""}.</p>`).join("")}
  <p class="muted">${esc(responseExplanation(call, responseCompatibility))}</p>
    <div class="detail-section">
      <h3>Подтверждённые связи полей (${fmt(call.fieldCount)})</h3>
      <div class="field-list">${fields || `<span class="muted">Общих или доказанно сопоставленных полей пока нет.</span>`}</div>
    </div>
    <div class="detail-section">
      <h3>Доказанный путь атрибута</h3>
      ${fieldJourneyRows ? `
        <table class="table">
          <thead><tr><th>Источник</th><th></th><th>Получатель</th><th>Поле</th></tr></thead>
          <tbody>${fieldJourneyRows}</tbody>
        </table>
      ` : `<p class="muted">Для этого шага транспорт доказан, но пополевой путь ещё не восстановлен.</p>`}
    </div>
    <div class="detail-section">
      <h3>Поля отправителя (${fmt(call.sourceFieldCount)})</h3>
      <div class="field-list">${sourceFields || `<span class="muted">Физическая структура модели у отправителя не раскрыта.</span>`}</div>
    </div>
    <div class="detail-section">
      <h3>Поля получателя (${fmt(call.targetFieldCount)})</h3>
      <div class="field-list">${targetFields || `<span class="muted">Физическая структура модели у получателя не раскрыта.</span>`}</div>
    </div>
    <div class="detail-section">
      <h3>Точный контракт этого шага</h3>
      <table class="table">
        <thead><tr><th>Доказательство</th><th>Общие поля</th><th>Модель</th><th>Подтверждён</th></tr></thead>
        <tbody>${contracts || `<tr><td colspan="4" class="muted">Нет контракта.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function loadSequenceContractDetail(call) {
  const contractId = call.contractId;
  if (!contractId || state.contractDetailLoads.has(contractId)) return;
  state.contractDetailLoads.add(contractId);
  api(`/api/snapshots/${encodeURIComponent(state.snapshot.id)}/contract-detail?contract_id=${encodeURIComponent(contractId)}`)
    .then((detail) => {
      const contract = (state.graph?.contracts || []).find((item) => item.contractId === contractId);
      if (contract) Object.assign(contract, detail, { detailLoaded: true });
      state.contractDetailLoads.delete(contractId);
      renderSequenceView();
    })
    .catch((error) => {
      state.contractDetailLoads.delete(contractId);
      showError(error);
    });
}

function bindSequenceCanvasInteractions() {
  const canvas = $("sequence-canvas");
  if (!canvas) return;
  let drag = null;
  canvas.onmousedown = (event) => {
    if (event.button !== 0) return;
    if (event.target.closest(".seq-call-card, button, input, select, a")) return;
    drag = { x: event.clientX, y: event.clientY, left: canvas.scrollLeft, top: canvas.scrollTop };
    canvas.classList.add("panning");
  };
  canvas.onmousemove = (event) => {
    if (!drag) return;
    canvas.scrollLeft = drag.left - (event.clientX - drag.x);
    canvas.scrollTop = drag.top - (event.clientY - drag.y);
  };
  canvas.onmouseup = () => {
    drag = null;
    canvas.classList.remove("panning");
  };
  canvas.onmouseleave = canvas.onmouseup;
  canvas.onwheel = (event) => {
    if (event.target.closest(".process-map-picker, .process-map-controls")) return;
    if (state.sequence.diagramMode === "process" && !state.sequence.processId) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    setSequenceZoom(
      state.sequence.zoom + (event.deltaY < 0 ? 0.08 : -0.08),
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
    );
  };
  canvas.querySelectorAll(".seq-fragment").forEach((el) => {
    el.querySelector(".seq-fragment-tab")?.addEventListener("click", (event) => {
      event.stopPropagation();
      state.sequence.selectedFragmentId = el.dataset.fragmentId || "";
      const params = new URLSearchParams(window.location.search);
      params.delete("step");
      window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
      renderSequenceView();
    });
  });
  canvas.querySelectorAll(".seq-call").forEach((el) => {
    el.onclick = () => {
      setInspectorTab("detail");
      state.sequence.selectedId = el.dataset.callId || "";
      state.sequence.selectedFragmentId = "";
      const selectedCall = state.sequence.data?.calls.find((call) => call.id === state.sequence.selectedId);
      const params = new URLSearchParams(window.location.search);
      if (selectedCall?.order?.step) params.set("step", selectedCall.order.step);
      else params.delete("step");
      window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
      renderSequenceView();
    };
  });
  canvas.querySelectorAll("[data-map-view]").forEach((el) => {
    el.onclick = (event) => {
      event.stopPropagation();
      setProcessMapView(el.dataset.mapView || "overview");
    };
  });
  canvas.querySelectorAll("[data-map-flow]").forEach((el) => {
    el.onclick = (event) => {
      event.stopPropagation();
      setProcessMapFlow(el.dataset.mapFlow || "all");
    };
  });
  canvas.querySelectorAll("[data-stage-summary]").forEach((el) => {
    el.onclick = (event) => {
      event.stopPropagation();
      const stage = Number(el.dataset.stageSummary);
      if (Number.isFinite(stage)) setProcessMapView("stage", stage);
    };
  });
  canvas.querySelectorAll(".process-map-stage-header").forEach((el) => {
    el.onclick = (event) => {
      event.stopPropagation();
      setInspectorTab("detail");
      const selectedStage = Number(el.dataset.mapStage);
      if (Number.isFinite(selectedStage)) setProcessMapView("stage", selectedStage);
    };
  });
  canvas.querySelectorAll(".process-map-node:not([data-stage-summary])").forEach((el) => {
    el.onclick = (event) => {
      event.stopPropagation();
      setInspectorTab("detail");
      state.sequence.selectedId = el.dataset.callId || "";
      state.sequence.selectedStage = null;
      state.sequence.selectedRegionId = "";
      state.sequence.selectedRelationId = "";
      const selectedCall = state.sequence.processMapData?.callById?.get(state.sequence.selectedId);
      const params = new URLSearchParams(window.location.search);
      if (state.sequence.mapView !== "stage") params.delete("mapStage");
      if (selectedCall?.order?.step) params.set("step", selectedCall.order.step);
      else params.delete("step");
      window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
      renderSequenceView();
    };
  });
  canvas.querySelectorAll(".process-map-gateway, .process-map-region-frame").forEach((el) => {
    el.onclick = (event) => {
      event.stopPropagation();
      setInspectorTab("detail");
      state.sequence.selectedStage = null;
      state.sequence.selectedRegionId = el.dataset.regionId || "";
      state.sequence.selectedRelationId = "";
      const params = new URLSearchParams(window.location.search);
      if (state.sequence.mapView !== "stage") params.delete("mapStage");
      params.delete("step");
      window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
      renderSequenceView();
    };
  });
  canvas.querySelectorAll(".process-map-edge-hit").forEach((el) => {
    el.onclick = (event) => {
      event.stopPropagation();
      setInspectorTab("detail");
      state.sequence.selectedStage = null;
      state.sequence.selectedRelationId = el.dataset.relationId || "";
      state.sequence.selectedRegionId = "";
      const params = new URLSearchParams(window.location.search);
      if (state.sequence.mapView !== "stage") params.delete("mapStage");
      params.delete("step");
      window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
      renderSequenceView();
    };
  });
}

function setSequenceZoom(value, anchor = null) {
  const canvas = $("sequence-canvas");
  const previous = state.sequence.zoom;
  const minimum = state.sequence.diagramMode === "process" ? 0.18 : 0.55;
  const next = Math.max(minimum, Math.min(1.85, Math.round(value * 100) / 100));
  if (next === previous) return;
  const point = canvas && anchor ? {
    baseX: (canvas.scrollLeft + anchor.x) / previous,
    baseY: (canvas.scrollTop + anchor.y) / previous,
    x: anchor.x,
    y: anchor.y,
  } : null;
  state.sequence.zoom = next;
  renderSequenceView();
  if (canvas && point) {
    requestAnimationFrame(() => {
      canvas.scrollLeft = point.baseX * next - point.x;
      canvas.scrollTop = point.baseY * next - point.y;
    });
  }
}

function focusProcessMapViewport(layout) {
  const canvas = $("sequence-canvas");
  if (!canvas || state.sequence.diagramMode !== "process") return;
  canvas.scrollTop = 0;
  if (layout?.viewMode !== "stage") {
    canvas.scrollLeft = 0;
    return;
  }
  const selectedStage = canvas.querySelector(".process-map-stage-band.selected");
  if (!selectedStage) {
    canvas.scrollLeft = 0;
    return;
  }
  const canvasRect = canvas.getBoundingClientRect();
  const stageRect = selectedStage.getBoundingClientRect();
  const stageLeft = stageRect.left - canvasRect.left + canvas.scrollLeft;
  const viewportWidth = canvas.clientWidth;
  const nextLeft = stageRect.width > viewportWidth - 64
    ? stageLeft - 24
    : stageLeft - (viewportWidth - stageRect.width) / 2;
  canvas.scrollLeft = Math.max(0, nextLeft);
}

function fitSequence(options = {}) {
  const canvas = $("sequence-canvas");
  if (state.sequence.diagramMode === "process") {
    const layout = state.sequence.processMapData;
    if (!canvas || !layout?.width) return;
    const horizontal = (canvas.clientWidth - 28) / layout.width;
    const vertical = (canvas.clientHeight - 96) / layout.height;
    let target = Math.min(horizontal, vertical, 1.2);
    if (options?.readable === true && layout.viewMode !== "diagnostic") {
      target = Math.max(target, layout.viewMode === "overview" ? 0.72 : 0.68);
    }
    setSequenceZoom(target);
    requestAnimationFrame(() => focusProcessMapViewport(state.sequence.processMapData));
    return;
  }
  const unscaled = buildSequenceData(1);
  if (!canvas || !unscaled.width) return;
  setSequenceZoom((canvas.clientWidth - 24) / unscaled.width);
}

function buildSequenceSvg(data = buildSequenceData(1)) {
  const serviceLabels = data.participants.map((part) => `
    <g>
      <line x1="${part.x}" y1="68" x2="${part.x}" y2="${data.height - 20}" stroke="#b8cdc5" stroke-dasharray="4 4"/>
      <rect x="${part.x - 75}" y="12" width="150" height="40" rx="8" fill="#fff" stroke="#b9cbc4"/>
      <text x="${part.x}" y="37" text-anchor="middle" font-size="12" font-weight="700" fill="#07523b">${esc(part.label)}</text>
    </g>
  `).join("");
  const calls = data.calls.map((call) => {
    const reverse = call.x2 < call.x1;
    const x1 = call.x1;
    const x2 = call.x2;
    const y = call.y + 22;
    const color = call.tier === "confirmed" ? "#0d8f62" : call.tier === "proven" ? "#2775d1" : call.tier === "candidate" ? "#bf7a09" : "#839990";
    const mid = (x1 + x2) / 2;
    return `
      <g data-call-id="${esc(call.id)}">
      <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${color}" stroke-width="3" marker-end="url(#arrow-${reverse ? "left" : "right"})"${call.proofTier === "proven" ? ` marker-start="url(#arrow-${reverse ? "right" : "left"})"` : ""}/>
      <rect x="${mid - 138}" y="${y - 39}" width="276" height="43" rx="8" fill="#fff" stroke="#b9cbc4"/>
      <text x="${mid}" y="${y - 22}" text-anchor="middle" font-size="11" font-weight="700" fill="#16231f">${fmt(call.step)} ${esc(call.sourceLabel)} → ${esc(call.targetLabel)}</text>
      <text x="${mid}" y="${y - 7}" text-anchor="middle" font-size="10" fill="#62736c">${esc(call.payload)} · ${esc(call.proof)}</text>
      </g>
    `;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(data.width)}" height="${Math.ceil(data.height)}" viewBox="0 0 ${Math.ceil(data.width)} ${Math.ceil(data.height)}">
  <defs>
    <marker id="arrow-right" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#0d8f62"/></marker>
    <marker id="arrow-left" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M10 0L0 5L10 10z" fill="#0d8f62"/></marker>
  </defs>
  <rect width="100%" height="100%" fill="#fbfdfc"/>
  ${serviceLabels}
  ${calls}
</svg>`;
}

function pumlAlias(service) {
  const clean = String(service || "svc").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return /^[0-9]/.test(clean) ? `s_${clean}` : clean || "svc";
}

function buildSequencePlantUml(data = buildSequenceData(1)) {
  const lines = [];
  lines.push("@startuml");
  lines.push(`title Сиквенс межсервисных вызовов — ${state.snapshot?.name || "snapshot"}`);
  lines.push("autonumber");
  lines.push("skinparam responseMessageBelowArrow true");
  const aliasBy = new Map();
  for (const part of data.participants) {
    const alias = pumlAlias(part.id);
    aliasBy.set(part.id, alias);
    lines.push(`participant "${part.label}" as ${alias}`);
  }
  const allCalls = buildSequenceData(1, { applyFilters: false }).calls;
  for (const call of data.calls) {
    const from = aliasBy.get(call.sourceService);
    const to = aliasBy.get(call.targetService);
    const payload = call.payload || "payload";
    const meta = [call.transport, call.proof].filter(Boolean).join(" · ");
    const note = meta ? ` (${meta})` : "";
    lines.push(`${from} -> ${to} : ${payload}${note}`);
    // Honest tiers: only a proven round-trip gets a return arrow.
    const tier = call.proofTier;
    if (tier) {
      const kind = call.responseSemantics?.kind || "";
      if (tier === "proven") {
        lines.push(`${to} --> ${from} : ${payload} (rs: ${kind || "round-trip доказан"})`);
      } else if (tier === "forward") {
        lines.push(`note right of ${to}: forward-конвейер, ответ не назад`);
      } else if (tier === "weak") {
        lines.push(`note right of ${to}: rq+rs по имени, структурно не доказано`);
      } else {
        lines.push(`note right of ${to}: ответ не доказан`);
      }
    } else {
      const proof = responseEvidence(call, allCalls);
      if (proof.kind === "same_model") {
        lines.push(`${to} --> ${from} : ${payload} (rs: ${proof.label})`);
      } else if (proof.kind === "synchronous") {
        lines.push(`${to} --> ${from} : ${proof.label}`);
      } else if (proof.kind === "missing") {
        lines.push(`note right of ${to}: ответ не доказан`);
      }
    }
  }
  lines.push("@enduml");
  return lines.join("\n");
}

function download(name, blob) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 5000);
}

async function hydrateSequenceExportContracts(data) {
  if (state.graphMode !== "sequence" || !state.snapshot?.id) return data;
  const contractById = new Map((state.graph?.contracts || []).map((contract) => [contract.contractId, contract]));
  const ids = uniq(data.calls.filter((call) => !call.isBridge).map((call) => call.contractId)).filter((id) => {
    const contract = contractById.get(id);
    return contract && !contract.detailLoaded;
  });
  for (let start = 0; start < ids.length; start += 8) {
    const batch = ids.slice(start, start + 8);
    const details = await Promise.all(batch.map(async (contractId) => {
      const detail = await api(`/api/snapshots/${encodeURIComponent(state.snapshot.id)}/contract-detail?contract_id=${encodeURIComponent(contractId)}`);
      return [contractId, detail];
    }));
    details.forEach(([contractId, detail]) => {
      Object.assign(contractById.get(contractId), detail, { detailLoaded: true });
    });
  }
  return buildSequenceData(1);
}

function buildProcessMapExportReport(process, layout) {
  const report = {
    width: layout.width,
    height: layout.height,
    presentationMode: layout.viewMode || state.sequence.mapView,
    flowFilter: layout.flowFilter || state.sequence.mapFlow,
    selectedStage: layout.selectedStage ?? state.sequence.mapStage,
    runtimeTraceSafe: layout.runtimeTraceSafe,
    unsequencedCount: layout.unsequencedCount,
    stages: layout.stages,
    start: layout.start,
    end: layout.end,
    calls: layout.calls,
    relations: layout.relations
      .filter((relation) => relation.renderMode !== "registry_reference")
      .map((relation) => {
      const from = layout.callById.get(relation.fromCallId);
      const to = layout.callById.get(relation.toCallId);
      const route = from && to ? window.AIProfilerProcessMap.edgeRoute(from, to, relation) : {};
      return {
        ...relation,
        path: route.path || "",
        labelX: route.labelX,
        labelY: route.labelY,
        startX: route.startX,
        startY: route.startY,
        endX: route.endX,
        endY: route.endY,
      };
      }),
    regions: layout.regions,
    controlPaths: layout.regions.flatMap((region) => region.links.map((link) => {
      const target = layout.callById.get(link.targetCallId);
      if (!target) return null;
      const labelWidth = Math.min(176, Math.max(54, String(link.label || "ветка").length * 5.6 + 14));
      const route = window.AIProfilerProcessMap.controlRoute(region, target, { ...link, labelWidth });
      return {
        regionId: region.id,
        kind: region.kind,
        targetCallId: link.targetCallId,
        label: link.label,
        path: route.path,
        labelX: route.labelX,
        labelY: route.labelY,
      };
    }).filter(Boolean)),
    boundaryPaths: layout.start.targetCallIds.map((callId) => {
        const call = layout.callById.get(callId);
        return call ? `M ${layout.start.x + 16} ${layout.start.y} H ${call.processMap.x}` : "";
      }).filter(Boolean),
    terminalPaths: (layout.end.points || []).map((point) => {
      const call = layout.callById.get(point.sourceCallId);
      return call ? {
        path: `M ${call.processMap.x + call.processMap.width} ${call.processMap.y + call.processMap.height / 2} H ${point.x - 16}`,
        ...point,
      } : null;
    }).filter(Boolean),
  };
  return JSON.parse(JSON.stringify({ process, ...report }));
}

function prepareExportAssetLinks(report) {
  report.calls.forEach((call) => {
    if (call.isRegistryBoundary) {
      (call.registryBoundary?.sourceRefs || []).forEach((sourceRef) => {
        const sourceFile = String(sourceRef.file || "");
        if (sourceFile) sourceRef.packageHref = `architecture_registry/${sourceFile.replace(/\\/g, "/").split("/").pop()}`;
      });
    }
    const contracts = [call.contract, ...(call.contracts || [])].filter(Boolean);
    contracts.forEach((contract) => {
      const mapping = contractMapping(contract);
      const href = mapping.href || mapping.file || "";
      if (href) mapping.packageHref = `mappings/${href.replace(/\\/g, "/").split("/").pop()}`;
      (contract.architectureRegistryRefs || []).forEach((registryRef) => {
        (registryRef.sourceRefs || []).forEach((sourceRef) => {
          const sourceFile = String(sourceRef.file || "");
          if (sourceFile) sourceRef.packageHref = `architecture_registry/${sourceFile.replace(/\\/g, "/").split("/").pop()}`;
        });
      });
    });
  });
  return report;
}

function buildProcessMapPlantUml(process, report) {
  const lines = ["@startuml", `title ${String(process?.name || "Карта процесса").replace(/[\r\n]+/g, " ")}`, "start"];
  for (const call of report.calls) {
    const purpose = String(call.order?.purpose || call.order?.reason || "").replace(/[\r\n]+/g, " ");
    lines.push(`:${call.sourceLabel} -> ${call.targetLabel}\\n${call.payload || "model unknown"};`);
    if (purpose) lines.push(`note right: ${purpose.slice(0, 240)}`);
  }
  lines.push("stop", "@enduml");
  return lines.join("\n");
}

async function exportProcessMap(kind) {
  const process = state.sequence.processId
    ? (state.graph?.processes || []).find((item) => item.processId === state.sequence.processId)
    : null;
  if (!process) {
    showError(new Error("Сначала выберите один процесс для экспорта карты."));
    return;
  }
  let data = buildSequenceData(1);
  if (["html", "package"].includes(kind)) data = await hydrateSequenceExportContracts(data);
  const fullLayout = window.AIProfilerProcessMap?.build(process, data.calls);
  const layout = window.AIProfilerProcessMapPresentation?.build(fullLayout, {
    viewMode: state.sequence.mapView,
    flowFilter: state.sequence.mapFlow,
    selectedStage: state.sequence.mapStage,
  }) || fullLayout;
  if (!layout?.calls?.length) {
    showError(new Error("В карте нет блоков под текущим фильтром."));
    return;
  }
  let report = buildProcessMapExportReport(process, layout);
  if (kind === "package") report = prepareExportAssetLinks(report);
  const safeName = String(process.name || process.processId || "process")
    .replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]+/g, "_");
  const presentationSuffix = `${layout.viewMode || "diagnostic"}_${layout.flowFilter || "all"}`;
  const base = `process_map_${state.snapshot?.name || "snapshot"}_${safeName}_${presentationSuffix}`;
  if (kind === "json") {
    return download(`${base}.json`, new Blob([JSON.stringify({ snapshot: state.snapshot, process, report }, null, 2)], { type: "application/json;charset=utf-8" }));
  }
  if (kind === "puml") {
    return download(`${base}.puml`, new Blob([buildProcessMapPlantUml(process, report)], { type: "text/plain;charset=utf-8" }));
  }
  const svg = window.AIProfilerProcessMapExport.buildSvg(report);
  if (kind === "svg") return download(`${base}.svg`, new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  if (kind === "html" || kind === "package") {
    const button = $(kind === "package" ? "seq-export-package" : "seq-export-html");
    const oldLabel = button?.textContent;
    if (button) {
      button.disabled = true;
      button.textContent = kind === "package" ? "Собираю ZIP…" : "Собираю…";
    }
    try {
      const documentHtml = window.AIProfilerProcessMapExport.buildHtml({
        title: `AI Profiler — ${process.name}`,
        generatedAt: new Date().toLocaleString("ru-RU"),
        snapshot: state.snapshot,
        process,
        report,
      });
      if (kind === "html") {
        return download(`${base}.html`, new Blob([documentHtml], { type: "text/html;charset=utf-8" }));
      }
      const contractIds = uniq(report.calls.filter((call) => !call.isBridge).map((call) => call.contractId));
      const response = await fetch(`/api/snapshots/${encodeURIComponent(state.snapshot.id)}/sequence-package`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html: documentHtml,
          contractIds,
          processName: process.name || "",
          processId: process.processId || "",
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || `${response.status} ${response.statusText}`);
      }
      return download(`ai_profiler_${state.snapshot?.name || "snapshot"}_${safeName}_process_map.zip`, await response.blob());
    } catch (error) {
      showError(error);
      return undefined;
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = oldLabel;
      }
    }
  }
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(report.width * 2);
    canvas.height = Math.ceil(report.height * 2);
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => blob && download(`${base}.png`, blob), "image/png");
  };
  image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

async function exportSequence(kind) {
  if (state.sequence.diagramMode === "process") return exportProcessMap(kind);
  let data = buildSequenceData(1);
  const base = `sequence_${state.snapshot?.name || "snapshot"}_${state.sequence.confidentOnly ? "confident" : "all"}`;
  if (kind === "json") {
    return download(`${base}.json`, new Blob([JSON.stringify({
      snapshot: state.snapshot,
      confidentOnly: state.sequence.confidentOnly,
      filter: state.sequence.filter,
      calls: data.calls,
      tierCounts: data.tierCounts,
    }, null, 2)], { type: "application/json;charset=utf-8" }));
  }
  if (kind === "puml") {
    return download(`${base}.puml`, new Blob([buildSequencePlantUml(data)], { type: "text/plain;charset=utf-8" }));
  }
  if (kind === "package") {
    const button = $("seq-export-package");
    const oldLabel = button?.textContent;
    if (button) {
      button.disabled = true;
      button.textContent = "Собираю ZIP…";
    }
    try {
      data = await hydrateSequenceExportContracts(data);
      const process = state.sequence.processId
        ? (state.graph?.processes || []).find((item) => item.processId === state.sequence.processId)
        : null;
      const packageData = JSON.parse(JSON.stringify(data));
      packageData.calls.forEach((call) => {
        const contracts = [call.contract, ...(call.contracts || [])].filter(Boolean);
        contracts.forEach((contract) => {
          const mapping = contractMapping(contract);
          const href = mapping.href || mapping.file || "";
          if (href) mapping.packageHref = `mappings/${href.replace(/\\/g, "/").split("/").pop()}`;
          (contract.architectureRegistryRefs || []).forEach((registryRef) => {
            (registryRef.sourceRefs || []).forEach((sourceRef) => {
              const sourceFile = String(sourceRef.file || "");
              if (sourceFile) sourceRef.packageHref = `architecture_registry/${sourceFile.replace(/\\/g, "/").split("/").pop()}`;
            });
          });
        });
      });
      const html = window.AIProfilerSequenceExport.buildHtml({
        title: process?.name ? `AI Profiler — ${process.name}` : "Сиквенс межсервисных вызовов",
        generatedAt: new Date().toLocaleString("ru-RU"),
        snapshot: state.snapshot,
        process,
        filter: state.sequence.filter,
        confidentOnly: state.sequence.confidentOnly,
        data: packageData,
        svg: buildSequenceSvg(packageData),
      });
      const contractIds = uniq(packageData.calls.filter((call) => !call.isBridge).map((call) => call.contractId));
      const response = await fetch(`/api/snapshots/${encodeURIComponent(state.snapshot.id)}/sequence-package`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html,
          contractIds,
          processName: process?.name || "",
          processId: process?.processId || "",
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || `${response.status} ${response.statusText}`);
      }
      const safeProcess = String(process?.name || "all_calls").replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]+/g, "_");
      return download(`ai_profiler_${state.snapshot?.name || "snapshot"}_${safeProcess}.zip`, await response.blob());
    } catch (error) {
      showError(error);
      return undefined;
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = oldLabel;
      }
    }
  }
  const svg = buildSequenceSvg(data);
  if (kind === "svg") return download(`${base}.svg`, new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  if (kind === "html") {
    const button = $("seq-export-html");
    const oldLabel = button?.textContent;
    if (button) {
      button.disabled = true;
      button.textContent = "Собираю…";
    }
    try {
      data = await hydrateSequenceExportContracts(data);
      const process = state.sequence.processId
        ? (state.graph?.processes || []).find((item) => item.processId === state.sequence.processId)
        : null;
      const html = window.AIProfilerSequenceExport.buildHtml({
        title: "Сиквенс межсервисных вызовов",
        generatedAt: new Date().toLocaleString("ru-RU"),
        snapshot: state.snapshot,
        process,
        filter: state.sequence.filter,
        confidentOnly: state.sequence.confidentOnly,
        data,
        svg: buildSequenceSvg(data),
      });
      return download(`${base}.html`, new Blob([html], { type: "text/html;charset=utf-8" }));
    } catch (error) {
      showError(error);
      return undefined;
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = oldLabel;
      }
    }
  }
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(data.width * 2);
    canvas.height = Math.ceil(data.height * 2);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => blob && download(`${base}.png`, blob), "image/png");
  };
  image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function renderProcessesBlock() {
  const processes = state.graph?.processes || [];
  if (!processes.length) return "";
  const renderCards = (items) => items.map((proc) => {
    const tiers = proc.proofTierCounts || {};
    const readiness = proc.readiness || {};
    const leaves = (proc.leafServices || []).map((s) => sequenceServiceName(s)).join(", ");
    return `
      <article class="process-card" data-process="${esc(proc.processId)}" title="Показать этот процесс в сиквенсе">
        <div class="process-head"><strong>${esc(proc.name)}</strong><span class="badge">${fmt(proc.memberCount)} сервисов</span><span class="badge">${esc(processKindLabel(proc.processKind))}</span><span class="badge">${esc(processScopeLabel(proc.interactionScope))}</span><span class="badge ${processCorpusClosed(proc) ? "proof-proven" : "warn"}">${esc(processClosureLabel(proc))}</span>${readiness.score != null ? `<span class="badge proof-proven">${fmt(readiness.score)}/100</span>` : ""}</div>
        <div class="process-meta">
          <span>вход: <b>${esc(proc.entryLabel)}</b></span>
          <span>передач: ${fmt(proc.physicalHandoffCount ?? proc.edgeCount)}</span>
          ${Number(proc.pathVariantOccurrenceCount || 0) ? `<span>вариантов пути: ${fmt(proc.stepOccurrenceCount || proc.edgeCount)}</span>` : ""}
          <span>глубина: ${fmt(proc.depth)}</span>
          <span>fan-out: ${fmt(proc.fanOut)}</span>
        </div>
        <div class="process-meta">
          <span class="badge proof-proven">${fmt(tiers.proven || 0)} round-trip</span>
          <span class="badge proof-forward">${fmt(tiers.forward || 0)} forward</span>
          <span class="badge warn">${fmt((tiers.weak || 0) + (tiers.none || 0))} без proof</span>
        </div>
        <div class="process-meta muted">листья: ${esc(leaves || "—")}</div>
        ${readiness.crossSourceGroupScore != null ? `<div class="process-meta"><span class="badge proof-proven">межФП ${fmt(readiness.crossSourceGroupScore)}/100</span></div>` : ""}
        ${proc.assemblyComplete === false ? `<div class="process-meta muted">${proc.closureStatus === "open_external_dependency" ? "граница корпуса" : "разрыв"}: ${esc((proc.assemblyReasons || []).map(processAssemblyReasonLabel).join(", ") || "продолжение не доказано")}</div>` : ""}
        ${proc.narrative ? `<div class="process-meta muted process-narrative">${esc(proc.narrative)}</div>` : ""}
      </article>`;
  }).join("");
  const complete = processes.filter(processCorpusClosed);
  const partial = processes.filter((proc) => !processCorpusClosed(proc));
  const strictlyClosed = processes.filter((proc) => proc.assemblyComplete !== false);
  const externalBoundary = processes.filter((proc) => proc.closureStatus === "open_external_dependency");
  const internalGap = processes.filter((proc) => proc.closureStatus === "internal_gap");
  const incomingContextGap = processes.filter((proc) => proc.closureStatus === "incoming_context_gap");
  const unknownGap = processes.filter((proc) => proc.closureStatus === "unknown_gap");
  const completeBusiness = complete.filter((proc) => proc.processKind === "business_execution");
  const completeTechnical = complete.filter((proc) => proc.processKind !== "business_execution");
  const chains = complete.filter((proc) => !String(proc.scenarioKind || "").startsWith("single_handoff") && Number(proc.physicalHandoffCount ?? proc.edgeCount ?? 0) > 1);
  const singleHandoffs = complete.filter((proc) => String(proc.scenarioKind || "").startsWith("single_handoff") || Number(proc.physicalHandoffCount ?? proc.edgeCount ?? 0) <= 1);
  return `
    <h3 class="section-h">Сценарии исполнения (${processes.length})</h3>
    <p class="muted">В загруженном корпусе замкнуто: <b>${fmt(complete.length)}</b>, из них без выходов наружу: <b>${fmt(strictlyClosed.length)}</b>. Бизнес-цепочек: <b>${fmt(completeBusiness.length)}</b>, служебных/плановых: <b>${fmt(completeTechnical.length)}</b>. На незагруженной зависимости заканчиваются <b>${fmt(externalBoundary.length)}</b>; это граница доступного кода, а не внутренний разрыв. Внутренний разрыв найден в <b>${fmt(internalGap.length)}</b>, у <b>${fmt(incomingContextGap.length)}</b> не собран путь входящего отправителя, ещё не классифицированы <b>${fmt(unknownGap.length)}</b>.</p>
    <h3 class="section-h">Цепочки, закрытые в загруженном корпусе (${chains.length})</h3>
    <div class="process-grid">${renderCards(chains)}</div>
    ${singleHandoffs.length ? `
      <details class="process-single-group">
        <summary>Замкнутые передачи между сервисами (${singleHandoffs.length})</summary>
        <div class="process-grid">${renderCards(singleHandoffs)}</div>
      </details>` : ""}
    ${partial.length ? `
      <details class="process-single-group process-partial-group">
        <summary>Цепочки с незакрытыми выходами (${partial.length})</summary>
        <div class="process-grid">${renderCards(partial)}</div>
      </details>` : ""}`;
}

function processAssemblyReasonLabel(reason) {
  const labels = {
    upstream_execution_route_missing: "не найден исполняемый путь до входной границы",
    downstream_execution_route_missing: "не найден исполняемый путь после выходной границы",
  };
  return labels[reason] || reason;
}

function processResearchClassificationLabel(value) {
  return ({
    unmatched_http_endpoint: "HTTP-вызов найден, получатель среди загруженных сервисов не найден",
    unmatched_message_consumer: "Отправка сообщения найдена, подписчик среди загруженных сервисов не найден",
    unmatched_grpc_service: "gRPC-вызов найден, сервер среди загруженных сервисов не найден",
    configured_external_system: "Вызов ведёт во внешнюю систему",
    internal_continuation: "Код продолжает обработку внутри сервиса",
    technical_side_effect: "Техническое действие, не передача бизнес-процесса",
    unknown_boundary: "Назначение выхода пока не определено",
  })[value] || "Незакрытый выход процесса";
}

function processKindLabel(kind) {
  const labels = {
    business_execution: "business entry",
    scheduled_execution: "scheduler",
    transport_triggered_execution: "transport entry",
    framework_callback_execution: "framework callback",
  };
  return labels[kind] || kind || "entry type unknown";
}

function processScopeLabel(scope) {
  const labels = {
    internal_service: "внутренняя очередь сервиса",
    within_source_group: "межсервисный внутри ФП",
    cross_source_group: "между ФП",
  };
  return labels[scope] || "область не определена";
}

function renderExternalBridgesBlock() {
  const bridges = state.graph?.externalBridges || [];
  if (!bridges.length) return "";
  const rows = bridges.slice(0, 12).map((b) => `
    <tr>
      <td><b>${esc(sequenceServiceName(b.sourceService))}</b></td>
      <td class="mono">${esc(b.likelyTarget || "?")}</td>
      <td>${esc((b.matchedServiceFamily || []).map(sequenceServiceName).slice(0, 4).join(", ") || "—")}</td>
      <td>${esc(b.transportKind)}</td>
      <td>${fmt(b.exitCount)}</td>
      <td class="mono">${esc((b.payloadTypes || []).slice(0, 3).join(", "))}</td>
    </tr>`).join("");
  return `
    <h3 class="section-h">Внешние мосты — код зовёт систему вне корпуса (${bridges.length})</h3>
        <p class="muted">Это кодовые намерения (HTTP-клиент/продюсер без ресивера в корпусе): связь не доказана и не опровергнута — нужен исходник принимающей стороны.</p>
    <table class="table">
      <thead><tr><th>откуда</th><th>цель (из кода)</th><th>похожие сервисы корпуса</th><th>транспорт</th><th>выходов</th><th>payload</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderFpCoverageBlock() {
  const inventory = state.graph?.interactionBoundaryInventory || {};
  const groups = inventory.groups || [];
  if (!groups.length) return "";
  const crossContracts = (state.graph?.contracts || []).filter((contract) => contract.integrationScope === "cross_source_group");
  const provenCross = crossContracts.filter((contract) =>
    contract.status === "linked" && (contract.evidenceClaim?.status === "proven" || contract.proofLevel === "exact_contract")
  ).length;
  const cards = groups.map((group) => `
    <article class="process-card fp-card" data-sequence-scope="group:${esc(group.group)}">
      <div class="process-head"><strong>${esc(group.group)}</strong><span class="badge">${fmt(group.serviceCount)} сервисов</span></div>
      <div class="process-meta">
        <span>внутри ФП: <b>${fmt(group.withinLinkedBoundaryCount)}</b></span>
        <span>межФП наружу: <b>${fmt(group.crossOutgoingLinkedBoundaryCount)}</b></span>
        <span>межФП внутрь: <b>${fmt(group.crossIncomingLinkedBoundaryCount)}</b></span>
        <span>процессов: <b>${fmt(group.processCount)}</b></span>
      </div>
      <p class="muted">schema ${fmt(group.schemaCoveragePct)}% · неоднозначных ${fmt(group.ambiguousBoundaryCount)} · candidate-only ${fmt(group.candidateBoundaryCount)}</p>
    </article>
  `).join("");
  return `
    <h3 class="section-h">Контуры ФП</h3>
    <div class="process-grid fp-grid">
      ${cards}
      <article class="process-card fp-card cross-fp-card" data-sequence-scope="cross">
        <div class="process-head"><strong>МежФП-контур</strong><span class="badge proof-proven">${fmt(provenCross)} доказано</span></div>
        <div class="process-meta">
          <span>всего контрактов: <b>${fmt(crossContracts.length)}</b></span>
          <span>linked: <b>${fmt(crossContracts.filter((item) => item.status === "linked").length)}</b></span>
          <span>ambiguous: <b>${fmt(crossContracts.filter((item) => item.status === "ambiguous").length)}</b></span>
          <span>candidate: <b>${fmt(crossContracts.filter((item) => item.status === "candidate").length)}</b></span>
        </div>
        <p class="muted">Открыть только переходы между разными source groups.</p>
      </article>
    </div>`;
}

function renderArchitectureProcessRegistryBlock() {
  const scopes = state.graph?.architectureRegistry?.processScopes || [];
  if (!scopes.length) return "";
  const cards = scopes.map((scope) => {
    const counts = scope.reconciliationStatusCounts || {};
    const gapKinds = scope.componentBindingGapKindCounts || {};
    const bestProcess = (scope.matchedCodeProcesses || [])[0];
    const orderStatus = scope.orderEvidence?.status || "not_declared";
    const orderLabel = orderStatus === "declared_complete"
      ? "порядок задан полностью"
      : orderStatus === "declared_partial"
        ? "порядок задан частично"
        : "Excel не задаёт порядок";
    const processAttr = bestProcess ? ` data-process="${esc(bestProcess.processId)}"` : "";
    const bestMatch = bestProcess
      ? `Лучшее совпадение в коде: ${esc(bestProcess.name)} · ${fmt(bestProcess.matchedInteractionCount)} взаимодействий.`
      : "В загруженном коде соответствующий технический процесс пока не найден.";
    return `
      <article class="process-card registry-process-card"${processAttr}>
        <div class="process-head"><strong>${esc(scope.name)}</strong><span class="badge">Excel</span></div>
        <div class="process-meta">
          <span>ожидается: <b>${fmt(scope.expectedInteractionCount)}</b></span>
          <span>подтверждено кодом: <b>${fmt(scope.confirmedInteractionCount)}</b></span>
          <span>кандидатов: <b>${fmt(countOf(counts, "candidate_in_code"))}</b></span>
          <span>внешних/не загружено: <b>${fmt(countOf(gapKinds, "explicit_component_not_loaded") + countOf(gapKinds, "unknown_or_external_component"))}</b></span>
          <span>имя требует сверки: <b>${fmt(countOf(gapKinds, "alias_review") + countOf(gapKinds, "ambiguous_alias"))}</b></span>
        </div>
        <p class="muted">${esc(orderLabel)} · покрытие кодом ${fmt(scope.codeCoveragePct)}%</p>
        <p class="muted">${bestMatch}</p>
      </article>`;
  }).join("");
  return `
    <h3 class="section-h">Процессные контуры из архитектурного Excel</h3>
    <p class="muted">Excel задаёт ожидаемый состав взаимодействий. Последовательность берётся только из кода либо из отдельной колонки порядка.</p>
    <div class="process-grid registry-process-grid">${cards}</div>`;
}

function renderOverview() {
  const summary = state.graph?.summary || {};
  const readiness = state.graph?.architectReadiness || {};
  const registry = state.graph?.architectureRegistry?.summary || summary.architectureRegistry || {};
  const evidence = readiness.evidence || {};
  const evidenceCounts = evidence.statusCounts || summary.contractEvidenceStatusCounts || {};
  const response = readiness.responseSemantics || {};
  const audit = state.graph?.diagnostics?.contractModelAudit || {};
  const boundary = state.graph?.interactionBoundaryInventory?.summary || {};
  const auditBlock = audit.totalContracts ? `
    <h3 class="section-h">Проверка вариантов связи</h3>
    <div class="kv">
      <span>Всего вариантов связи</span><b>${fmt(audit.totalContracts)}</b>
      <span>Одинаковое имя модели с обеих сторон</span><b>${fmt(audit.withSharedTypeCount)}</b>
      <span>Имена модели расходятся (rq/rs тип)</span><b>${fmt(audit.nameDivergentCount)}</b>
      <span>Тип потребителя реально не разрешён</span><b>${fmt(audit.sourceTypeOnlyCount)}</b>
      <span>Без модели вообще</span><b>${fmt(audit.noModelCount)}</b>
      <span>Тонкие (≤2 поля)</span><b>${fmt(audit.tinyContractCount)}</b>
      <span>Дублирующихся пар сервисов</span><b>${fmt(audit.duplicateServicePairCount)}</b>
    </div>` : "";
  $("overview-panel").innerHTML = `
    <h2>${esc(state.snapshot?.name || "system_lineage")}</h2>
    <p class="muted">${esc(state.snapshot?.path || "")}</p>
    <div class="kv">
      <span>Сервисов</span><b>${fmt(summary.serviceCount)}</b>
      <span>Вариантов связи</span><b>${fmt(summary.contractCount)}</b>
      <span>Контуров ФП</span><b>${fmt(boundary.groupCount || 0)}</b>
      <span>Уникальных исходящих вызовов доказано</span><b>${fmt(boundary.linkedBoundaryCount || 0)} / ${fmt(boundary.totalObservedBoundaryCount || 0)} (${fmt(boundary.resolvedBoundaryCoveragePct || 0)}%)</b>
      <span>Неоднозначные / возможные</span><b>${fmt(boundary.ambiguousBoundaryCount || 0)} / ${fmt(boundary.candidateBoundaryCount || 0)}</b>
          <span>Ресивер не найден</span><b>${fmt(boundary.unresolvedOutgoingExitCount || 0)}</b>
      <span>Вызовов с раскрытыми путями полей</span><b>${fmt(boundary.fieldBoundaryCount || 0)} / ${fmt((boundary.linkedBoundaryCount || 0) + (boundary.ambiguousBoundaryCount || 0))}</b>
      <span>Технических цепочек от точек входа</span><b>${fmt(summary.processCount ?? (state.graph?.processes || []).length)}</b>
      <span>Внешних мостов (вне корпуса)</span><b>${fmt((state.graph?.externalBridges || []).length)}</b>
      <span>Связей путей полей</span><b>${fmt(summary.contractFieldLinkCount)}</b>
      <span>Готовность данных для архитектурного разбора</span><b>${esc(readiness.score ?? "—")}/100</b>
      <span>Архитектурно готовых шагов</span><b>${fmt(state.graph?.processReadiness?.summary?.readyStepCount || 0)}</b>
      <span>Уровень доказательства границ</span><b>${fmt(countOf(evidenceCounts, "proven"))} доказано · ${fmt(countOf(evidenceCounts, "partial"))} частично · ${fmt(countOf(evidenceCounts, "candidate"))} кандидаты</b>
      <span>Синхронный ответ</span><b>${fmt(summary.provenRoundtripContractCount ?? "—")} доказано · ${fmt(summary.weakResponseContractCount ?? "—")} слабо · ${fmt(summary.oneWayNoResponseContractCount ?? "—")} односторонние</b>
      ${registry.uniqueInteractionCount != null ? `
        <span>Архитектурный Excel-реестр</span><b>${fmt(registry.confirmedByCodeCount)} подтверждено кодом · ${fmt(registry.registryOnlyCount)} только в реестре · ${fmt(registry.componentBindingGapCount)} не привязано по имени или составу корпуса</b>
      ` : ""}
    </div>
    ${renderArchitectureProcessRegistryBlock()}
    ${renderFpCoverageBlock()}
    ${renderProcessesBlock()}
    ${renderExternalBridgesBlock()}
    ${auditBlock}
  `;
  for (const card of $("overview-panel").querySelectorAll(".process-card")) {
    if (card.dataset.sequenceScope) {
      card.onclick = () => focusSequenceScope(card.dataset.sequenceScope);
      continue;
    }
    card.onclick = () => {
      const proc = (state.graph?.processes || []).find((p) => p.processId === card.dataset.process);
      if (!proc) return;
      focusProcess(proc);
    };
  }
}

function buildThreeGroupDiscussionScenario() {
  const contracts = state.graph?.contracts || [];
  const trusted = contracts.filter((contract) =>
    contract.confirmed === true &&
    contract.presentationExcluded !== true &&
    contract.sourceGroup && contract.targetGroup &&
    contract.sourceGroup !== contract.targetGroup
  );
  for (let leftIndex = 0; leftIndex < trusted.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < trusted.length; rightIndex += 1) {
      const left = trusted[leftIndex];
      const right = trusted[rightIndex];
      const coveredGroups = new Set([left.sourceGroup, left.targetGroup, right.sourceGroup, right.targetGroup]);
      if (coveredGroups.size < 3 || left.sourceGroup !== right.sourceGroup) continue;
      const sharedGroup = left.sourceGroup;
      const bridge = contracts
        .filter((contract) =>
          contract.sourceGroup === sharedGroup &&
          contract.targetGroup === sharedGroup &&
          ((contract.sourceService === left.sourceService && contract.targetService === right.sourceService) ||
           (contract.sourceService === right.sourceService && contract.targetService === left.sourceService))
        )
        .sort((a, b) =>
          Number(b.proofLevel === "route_inferred") - Number(a.proofLevel === "route_inferred") ||
          Number(b.confirmed === true) - Number(a.confirmed === true) ||
          Number(b.sharedFieldCount || 0) - Number(a.sharedFieldCount || 0)
        )[0];
      if (!bridge) continue;
      return { left, right, bridge, sharedGroup, coveredGroups: [...coveredGroups] };
    }
  }
  return null;
}

function renderBriefing() {
  const data = state.graph?.briefing;
  const panel = $("briefing-panel");
  if (!data) {
    panel.innerHTML = `<div class="empty">Сводка загружается...</div>`;
    return;
  }
  const scope = data.scope || {};
  const cross = data.crossFp || {};
  const boundaries = data.boundaries || {};
  const processes = data.processes || {};
  const fields = data.fields || {};
  const snapshot = encodeURIComponent(state.snapshot?.id || "");
  const demoParam = state.demo ? "&demo=1" : "";
  const appLink = (view, extra = "") => `/app/?view=${encodeURIComponent(view)}&snapshot=${snapshot}${demoParam}${extra}`;
  const allGroupsCoveredByOneProcess = (processes.items || []).some((item) => new Set(item.groups || []).size >= Number(scope.groupCount || 0));
  const discussionScenario = state.demo ? buildThreeGroupDiscussionScenario() : null;
  const groups = (scope.groups || []).map((group) => `
    <article class="brief-card">
      <span class="brief-eyebrow">ФП</span>
      <h3>${esc(group.name)}</h3>
      <strong>${fmt(group.serviceCount)} сервисов</strong>
      <p>${fmt(group.trustedInternal)} внутренних связей подтверждено; ${fmt(group.candidateInternal)} возможных и ${fmt(group.ambiguousInternal)} неоднозначных.</p>
      <details><summary>Состав ФП</summary><p class="mono brief-small">${esc((group.services || []).join(", "))}</p></details>
      <a class="brief-link" href="${appLink("sequence", `&scope=group%3A${encodeURIComponent(group.id)}`)}">Показать на диаграмме</a>
    </article>
  `).join("");
  const matrixRows = (cross.matrix || []).map((row) => `
    <tr>
      <td><b>${esc(row.sourceGroup)}</b> → <b>${esc(row.targetGroup)}</b></td>
      <td>${fmt(row.fieldProven)}</td><td>${fmt(row.transportProven)}</td>
      <td>${fmt(row.ambiguous)}</td><td>${fmt(row.candidate)}</td><td>${fmt(row.excluded)}</td>
    </tr>
  `).join("");
  const trustedRows = (cross.trusted || []).map((row) => `
    <tr>
      <td><b>${esc(sequenceServiceName(row.sourceService))}</b> → <b>${esc(sequenceServiceName(row.targetService))}</b></td>
      <td>${esc(row.transport)}</td>
      <td>${esc((row.requestModels || []).join(", ") || "не раскрыт")} → ${esc((row.responseModels || []).join(", ") || "не раскрыт")}</td>
      <td>${fmt(row.sharedFieldCount)}</td>
      <td>${row.grade === "field_proven" ? "модель и поля" : "только маршрут"}</td>
    </tr>
  `).join("");
  const processRows = (processes.items || []).map((item) => `
    <tr><td>${esc(item.name)}</td><td>${esc((item.groups || []).join(" → "))}</td><td>${fmt(item.stepCount)}</td><td>${item.complete ? "замкнута" : "есть незакрытый выход"}</td></tr>
  `).join("");
  panel.innerHTML = `
    <div class="brief-hero">
      <div><span class="brief-eyebrow">Сводка текущего снимка</span><h2>${esc(data.title)}</h2><p>${esc(data.verdict?.status)}</p></div>
      <div class="brief-actions">
        <a class="primary-btn" href="${appLink("sequence", "&scope=cross")}">Показать меж-ФП</a>
        <a class="ghost-btn" href="${appLink("mappings")}">Открыть связи полей</a>
      </div>
    </div>
    ${state.demo ? `
      <section class="demo-walkthrough">
        <div class="demo-walkthrough-head">
          <div><span class="brief-eyebrow">Готовый сценарий · 7 минут</span><h3>Показывайте слева направо</h3></div>
          <span class="demo-truth ${allGroupsCoveredByOneProcess ? "ok" : "warn"}">${allGroupsCoveredByOneProcess ? "Есть единая цепочка через 3 ФП" : "Единая цепочка через 3 ФП пока не доказана"}</span>
        </div>
        <div class="demo-steps">
          <article><b>1</b><h3>Масштаб и честная граница</h3><p>${fmt(scope.groupCount)} ФП, ${fmt(scope.serviceCount)} сервисов. Доказано ${fmt(boundaries.proven)} из ${fmt(boundaries.observed)} уникальных исходящих вызовов.</p></article>
          <article><b>2</b><h3>Взаимодействия между ФП</h3><p>Покажите три точные связи ниже, затем откройте диаграмму и нажмите Collation → Secretary.</p><a class="primary-btn" href="${appLink("sequence", "&scope=cross")}">Открыть диаграмму</a></article>
          <article><b>3</b><h3>Поля и пробелы</h3><p>Откройте совпавшие поля модели, затем покажите, что слабые гипотезы отделены от результата.</p><a class="brief-link" href="${appLink("mappings", "&mapping=collation-%3Emrtg-reo-secretary")}">Поля</a><a class="brief-link" href="${appLink("gaps")}">Что не готово</a></article>
        </div>
        <p class="demo-honesty"><b>Важно:</b> все три ФП представлены на одном экране через доказанные связи, но это не одна последовательная бизнес-цепочка. Сейчас доказаны переходы между парами ФП.</p>
      </section>
      ${discussionScenario ? `
        <section class="discussion-scenario">
          <div class="brief-section-head">
            <div><span class="brief-eyebrow">Вероятный сценарий через 3 ФП</span><h3>Что показать как рабочую гипотезу</h3></div>
            <span class="demo-truth warn">нужна проверка владельцев</span>
          </div>
          <div class="scenario-flow">
            <div class="scenario-node"><small>${esc(discussionScenario.left.targetGroup)}</small><b>${esc(sequenceServiceName(discussionScenario.left.targetService))}</b></div>
            <div class="scenario-edge exact reverse"><span>←</span><small>доказано · ${fmt(discussionScenario.left.sharedFieldCount)} полей</small></div>
            <div class="scenario-node hub"><small>${esc(discussionScenario.sharedGroup)}</small><b>${esc(sequenceServiceName(discussionScenario.left.sourceService))}</b></div>
            <div class="scenario-edge hypothesis"><span>${discussionScenario.bridge.sourceService === discussionScenario.left.sourceService ? "⇢" : "⇠"}</span><small>маршрут найден, получатель под вопросом</small></div>
            <div class="scenario-node hub"><small>${esc(discussionScenario.sharedGroup)}</small><b>${esc(sequenceServiceName(discussionScenario.right.sourceService))}</b></div>
            <div class="scenario-edge exact"><span>→</span><small>доказано · ${fmt(discussionScenario.right.sharedFieldCount)} полей</small></div>
            <div class="scenario-node"><small>${esc(discussionScenario.right.targetGroup)}</small><b>${esc(sequenceServiceName(discussionScenario.right.targetService))}</b></div>
          </div>
          <p><b>Как рассказывать:</b> два меж-ФП края доказаны независимо. Средний переход найден в технической цепочке, но анализатор пока не подтвердил конкретный endpoint. Если владельцы подтвердят этот мост и порядок, получится связный сценарий всех трёх ФП.</p>
          <div class="scenario-questions">
            <span>Какой URL или topic связывает два сервиса MFD?</span>
            <span>Совпадают ли <code>rqUid</code>, <code>dealId</code> или <code>scoringUuid</code>?</span>
            <span>Это один запуск процесса или две независимые ветки?</span>
            <span>Есть ли runtime trace или конфигурация маршрута?</span>
          </div>
        </section>
      ` : ""}
    ` : ""}
    <div class="brief-verdict ok"><b>Что можно утверждать.</b> ${esc(data.verdict?.canShow)}</div>
    <div class="brief-verdict warn"><b>Что пока нельзя утверждать.</b> ${esc(data.verdict?.cannotClaim)}</div>
    <div class="brief-kpis">
      <div><strong>${fmt(scope.groupCount)}</strong><span>ФП · ${fmt(scope.serviceCount)} сервисов</span></div>
      <div><strong>${fmt(boundaries.proven)}/${fmt(boundaries.observed)}</strong><span>уникальных исходящих вызовов доказано</span></div>
      <div><strong>${fmt(cross.fieldProvenCount)} + ${fmt(cross.transportProvenCount)}</strong><span>меж-ФП: до полей + только маршрут</span></div>
      <div><strong>${fmt(processes.closed)}/${fmt(processes.total)}</strong><span>технических цепочек замкнуто</span></div>
      <div><strong>${fmt(fields.verified)}/${fmt(fields.total)}</strong><span>путей полей подтверждено</span></div>
    </div>
    <div class="demo-secondary"><h3 class="section-h">Охват трёх ФП</h3><div class="brief-grid">${groups}</div></div>
    <section class="brief-section demo-secondary">
      <div class="brief-section-head"><div><h3>Связи между ФП</h3><p>Здесь варианты получателя разделены по реальной силе доказательств.</p></div><a class="brief-link" href="${appLink("sequence", "&scope=cross")}">Открыть диаграмму</a></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Направление</th><th>Модель и поля</th><th>Только маршрут</th><th>Неоднозначно</th><th>Возможно</th><th>Исключено</th></tr></thead><tbody>${matrixRows}</tbody></table></div>
    </section>
    <section class="brief-section"><h3>Что подтверждено между ФП</h3><div class="table-wrap"><table class="table"><thead><tr><th>Сервисы</th><th>Как передаются данные</th><th>Запрос → ответ</th><th>Общих полей</th><th>Глубина доказательства</th></tr></thead><tbody>${trustedRows || `<tr><td colspan="5">Подтверждённых меж-ФП связей нет.</td></tr>`}</tbody></table></div></section>
    <div class="demo-secondary">
      ${(cross.excluded || []).length ? `<section class="brief-section"><h3>Что исключено из показа</h3><div class="table-wrap"><table class="table"><thead><tr><th>Переход</th><th>Почему исключён</th></tr></thead><tbody>${cross.excluded.map((row) => `<tr><td><b>${esc(sequenceServiceName(row.sourceService))}</b> → <b>${esc(sequenceServiceName(row.targetService))}</b></td><td>${esc(row.exclusionReason)}</td></tr>`).join("")}</tbody></table></div></section>` : ""}
      <section class="brief-section"><h3>Меж-ФП цепочки</h3><p>${fmt(processes.crossFp)} цепочек пересекают границу ФП; замкнутых среди них — ${fmt(processes.crossFpClosed)}. ${esc(data.verdict?.cannotClaim)}</p><div class="table-wrap"><table class="table"><thead><tr><th>Точка старта</th><th>ФП</th><th>Шаги</th><th>Состояние</th></tr></thead><tbody>${processRows}</tbody></table></div></section>
      <section class="brief-section"><h3>Почему ${fmt(cross.variantCount)} меж-ФП вариантов — не число реальных вызовов</h3><p>${esc(boundaries.explanation)}</p><p>${esc(data.quality?.note)}</p></section>
      <section class="brief-section"><h3>Что говорить на созвоне</h3><ol class="brief-talk">${(data.talkTrack || []).map((item) => `<li>${esc(item)}</li>`).join("")}</ol></section>
      <section class="brief-section"><h3>Что могут спросить</h3><div class="brief-defs">${(data.questions || []).map((item) => `<details><summary>${esc(item.question)}</summary><p>${esc(item.answer)}</p></details>`).join("")}</div></section>
    </div>
  `;
}

function focusSequenceScope(scope) {
  state.sequence.scope = scope || "all";
  state.sequence.processId = "";
  state.sequence.processMembers = null;
  state.sequence.selectedId = "";
  state.sequence.selectedStage = null;
  state.sequence.mapStage = null;
  state.sequence.mapView = "overview";
  state.sequence.mapFlow = "all";
  state.sequence.selectedRegionId = "";
  state.sequence.selectedRelationId = "";
  const select = $("sequence-scope");
  if (select) select.value = state.sequence.scope;
  const params = new URLSearchParams(window.location.search);
  params.set("scope", state.sequence.scope);
  params.delete("process");
  params.delete("step");
  params.delete("mapStage");
  params.delete("mapView");
  params.delete("mapFlow");
  window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  setView("sequence");
}

function focusProcess(proc) {
  state.sequence.processId = proc.processId;
  state.sequence.processMembers = new Set(proc.memberServices || []);
  state.sequence.confidentOnly = true;
  state.sequence.filter = "";
  state.sequence.scope = "all";
  const confidentToggle = $("sequence-confident-only");
  if (confidentToggle) confidentToggle.checked = true;
  const input = $("sequence-filter");
  if (input) input.value = "";
  const scopeSelect = $("sequence-scope");
  if (scopeSelect) scopeSelect.value = "all";
  const params = new URLSearchParams(window.location.search);
  params.set("process", proc.processId);
  params.set("scope", "all");
  params.delete("step");
  params.delete("mapStage");
  params.delete("mapView");
  params.delete("mapFlow");
  state.sequence.selectedId = "";
  state.sequence.selectedStage = null;
  state.sequence.mapStage = null;
  state.sequence.mapView = "overview";
  state.sequence.mapFlow = "all";
  state.sequence.selectedRegionId = "";
  state.sequence.selectedRelationId = "";
  window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  setView("sequence");
  if (state.sequence.diagramMode === "process") requestAnimationFrame(() => fitSequence({ readable: true }));
}

function clearProcessFocus() {
  state.sequence.processId = "";
  state.sequence.processMembers = null;
  state.sequence.selectedId = "";
  state.sequence.selectedStage = null;
  state.sequence.mapStage = null;
  state.sequence.mapView = "overview";
  state.sequence.mapFlow = "all";
  state.sequence.selectedRegionId = "";
  state.sequence.selectedRelationId = "";
  const params = new URLSearchParams(window.location.search);
  params.delete("process");
  params.delete("step");
  params.delete("mapStage");
  params.delete("mapView");
  params.delete("mapFlow");
  window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  renderSequenceView();
}

const mappingView = globalThis.AIProfilerMappingView;

function buildMappingRows() {
  return mappingView.buildRows(state.graph || {}, state.mappings, {
    serviceName: sequenceServiceName,
    strictContract: strictLegacyContract,
  });
}

function renderMappingsView() {
  if (!state.graph) return;
  const rows = buildMappingRows();
  $("mapping-summary").textContent = mappingView.summary(state.graph, rows, {
    strictContract: strictLegacyContract,
  });
  if (!state.mappings.selectedId || !rows.some((row) => row.id === state.mappings.selectedId)) {
    state.mappings.selectedId = rows[0]?.id || "";
  }
  $("mapping-table").innerHTML = mappingView.tableHtml(rows, state.mappings.selectedId);
  document.querySelectorAll("[data-mapping-id]").forEach((row) => {
    row.onclick = () => {
      state.mappings.selectedId = row.dataset.mappingId || "";
      state.mappings.csvPreview = null;
      state.mappings.csvPreviewFor = "";
      renderMappingsView();
    };
  });
  renderMappingDetail(rows);
}

function renderMappingDetail(rows = buildMappingRows()) {
  const row = rows.find((item) => item.id === state.mappings.selectedId);
  if (!row) {
    $("mapping-detail").innerHTML = `<div class="empty">Выберите маппинг.</div>`;
    return;
  }
  const contract = row.contract;
  if (state.graphMode === "sequence" && !contract.detailLoaded) {
    $("mapping-detail").innerHTML = `
      <h3>${esc(row.sourceLabel)} → ${esc(row.targetLabel)}</h3>
      <p class="muted">Загружаю поля и доказательства выбранного контракта…</p>
    `;
    loadMappingContractDetail(contract.contractId);
    return;
  }
  $("mapping-detail").innerHTML = mappingView.detailHtml(row, {
    csvPreview: state.mappings.csvPreview,
    csvPreviewFor: state.mappings.csvPreviewFor,
    fileUrl,
  });
  const loadCsv = $("mapping-load-csv");
  if (loadCsv) loadCsv.onclick = async () => loadMappingCsvPreview(row);
}
function loadMappingContractDetail(contractId) {
  if (!contractId || state.contractDetailLoads.has(contractId)) return;
  state.contractDetailLoads.add(contractId);
  api(`/api/snapshots/${encodeURIComponent(state.snapshot.id)}/contract-detail?contract_id=${encodeURIComponent(contractId)}`)
    .then((detail) => {
      const contract = (state.graph?.contracts || []).find((item) => item.contractId === contractId);
      if (contract) Object.assign(contract, detail, { detailLoaded: true });
      state.contractDetailLoads.delete(contractId);
      renderMappingsView();
    })
    .catch((error) => {
      state.contractDetailLoads.delete(contractId);
      showError(error);
    });
}

async function loadMappingCsvPreview(row) {
  state.mappings.csvPreviewFor = row.id;
  try {
    state.mappings.csvPreview = await api(`/api/datasurf/preview?path=${encodeURIComponent(row.csv)}&limit=120`);
  } catch (error) {
    state.mappings.csvPreview = { error: "CSV рядом с этим XLSX не найден. Используйте XLSX или contract field links из снапшота." };
  }
  renderMappingDetail();
}

function renderModelsView() {
  const graph = state.graph?.modelIdentityGraph || {};
  const catalog = state.graph?.schemaModelCatalog || [];
  $("models-panel").innerHTML = `
    <h2>Model identity graph</h2>
    <p class="muted">${fmt(graph.summary?.nodeCount)} узлов · ${fmt(graph.summary?.edgeCount)} связей · ${fmt(catalog.length)} schema models</p>
    <table class="table">
      <thead><tr><th>Модель</th><th>Service</th><th>Источник</th><th>Поля</th></tr></thead>
      <tbody>${catalog.slice(0, 120).map((item) => `
        <tr>
          <td><b>${esc(item.modelName || item.name || item.modelKey || "")}</b></td>
          <td>${esc(item.service || item.serviceId || "")}</td>
          <td>${esc(item.modelOrigin || (item.sourceKinds || []).join(", ") || item.source || item.kind || "")}${item.boundFromServiceId ? `<div class="muted">from ${esc(item.boundFromServiceId)}</div>` : ""}</td>
          <td>${fmt(item.fieldCount || (item.fields || []).length)}</td>
        </tr>
      `).join("") || `<tr><td colspan="4" class="muted">Schema catalog пуст.</td></tr>`}</tbody>
    </table>
  `;
}

function renderFieldsTableView() {
  const links = state.graph?.contractFieldLinks || [];
  const confident = links.filter((link) => link.confirmed === true);
  $("fields-panel").innerHTML = `
    <h2>Пополевые связи</h2>
    <p class="muted">По умолчанию показаны только confirmed field links: ${fmt(confident.length)} из ${fmt(links.length)}.</p>
    <table class="table">
      <thead><tr><th>Откуда</th><th>Куда</th><th>Поле</th><th>Proof</th></tr></thead>
      <tbody>${confident.slice(0, 220).map((link) => `
        <tr>
          <td>${esc(sequenceServiceName(link.sourceService))}<div class="mono">${esc((link.sourcePaths || []).join(", "))}</div></td>
          <td>${esc(sequenceServiceName(link.targetService))}<div class="mono">${esc((link.targetPaths || []).join(", "))}</div></td>
          <td><b>${esc(link.field)}</b></td>
          <td>${esc(link.proofLevel || "")}</td>
        </tr>
      `).join("") || `<tr><td colspan="4" class="muted">Нет confirmed field links.</td></tr>`}</tbody>
    </table>
  `;
}

function renderFieldsView() {
  renderFieldsTableView();
  const panel = $("fields-panel");
  const journey = state.fieldJourney.result;
  const journeyRows = (journey?.items || []).slice(0, 30).map((item) => `
    <tr>
      <td>${fmt(item.depth)}</td>
      <td>${(item.steps || []).map((step) => `
        <div><b>${esc(sequenceServiceName(step.sourceService))}</b> → <b>${esc(sequenceServiceName(step.targetService))}</b></div>
        <div class="mono">${esc(step.sourcePath)} → ${esc(step.targetPath)}</div>
      `).join("")}</td>
      <td>${esc((item.steps || []).map((step) => step.proofLevel).filter(Boolean).join(" → "))}</td>
    </tr>
  `).join("");
  panel.insertAdjacentHTML("afterbegin", `
    <div class="detail-section">
      <h2>Путь атрибута через сервисы</h2>
      <div class="toolbar">
        <input id="field-journey-query" value="${esc(state.fieldJourney.query)}" placeholder="Поле или путь: dealId" />
        <select id="field-journey-direction">
          <option value="downstream" ${state.fieldJourney.direction === "downstream" ? "selected" : ""}>Вниз по потоку</option>
          <option value="upstream" ${state.fieldJourney.direction === "upstream" ? "selected" : ""}>Вверх к источнику</option>
        </select>
        <label><input id="field-journey-confirmed" type="checkbox" ${state.fieldJourney.confirmedOnly ? "checked" : ""} /> только confirmed</label>
        <button class="mini-btn" id="field-journey-run" ${state.fieldJourney.loading ? "disabled" : ""}>${state.fieldJourney.loading ? "Ищу…" : "Найти пути"}</button>
      </div>
      ${journey ? `
        <p class="muted">Движок: <b>${esc(journey.storage)}</b> · найдено: ${fmt(journey.total)} · глубина до ${fmt(journey.maxDepth)}</p>
        <table class="table">
          <thead><tr><th>Глубина</th><th>Маршрут атрибута</th><th>Доказательства</th></tr></thead>
          <tbody>${journeyRows || `<tr><td colspan="3" class="muted">Пути не найдены.</td></tr>`}</tbody>
        </table>
      ` : ""}
    </div>
  `);
  $("field-journey-run").onclick = async () => {
    const query = $("field-journey-query").value.trim();
    if (!query) return;
    state.fieldJourney.query = query;
    state.fieldJourney.direction = $("field-journey-direction").value;
    state.fieldJourney.confirmedOnly = $("field-journey-confirmed").checked;
    state.fieldJourney.loading = true;
    renderFieldsView();
    try {
      state.fieldJourney.result = await api(
        `/api/snapshots/${encodeURIComponent(state.snapshot.id)}/field-journeys?field=${encodeURIComponent(query)}`
        + `&direction=${encodeURIComponent(state.fieldJourney.direction)}&depth=8&confirmed_only=${state.fieldJourney.confirmedOnly}`
      );
    } catch (error) {
      showError(error);
    } finally {
      state.fieldJourney.loading = false;
      renderFieldsView();
    }
  };
}

function renderGapsView() {
  const readiness = state.graph?.architectReadiness || {};
  const summary = state.graph?.summary || {};
  const evidence = readiness.evidence || {};
  const evidenceCounts = evidence.statusCounts || summary.contractEvidenceStatusCounts || {};
  const responseReadiness = readiness.responseSemantics || {};
  const responseCounts = responseReadiness.statusCounts || summary.responseSemanticsCounts || {};
  const gates = readiness.trustGates || {};
  const conflicts = state.graph?.consistencyConflicts || {};
  const blockers = readiness.topBlockers || [];
  const allData = buildSequenceData(1, { applyFilters: false });
  const allCalls = allData.calls;
  const responseRows = allCalls.map((call) => ({ call, response: responseEvidence(call, allCalls) }));
  const missingResponses = responseRows.filter((row) => row.response.kind === "missing");
  const sameModel = responseRows.filter((row) => row.response.kind === "same_model");
  const strictContracts = (state.graph?.contracts || []).filter((contract) => contract.confirmed === true || strictLegacyContract(contract));
  const tinyContracts = (state.graph?.contracts || []).filter((contract) => Number(contract.sharedFieldCount || 0) <= 2);
  const gateRows = Object.entries(gates).map(([key, value]) => `
    <tr><td>${esc(key)}</td><td>${value ? "pass" : "review"}</td></tr>
  `).join("");
  $("gaps-panel").innerHTML = `
    <h2>Качество среза</h2>
    <p class="muted">Это не “всё точно”; слабые связи и мелкие совпадения отделены от уверенного слоя.</p>
    <div class="kv">
      <span>Readiness</span><b>${esc(readiness.score ?? "—")}/100</b>
      <span>Status</span><b>${esc(readiness.status || "")}</b>
      <span>Evidence score</span><b>${evidence.score == null ? "not recorded" : `${esc(evidence.score)}/100`}</b>
      <span>Response score</span><b>${responseReadiness.score == null ? "not recorded" : `${esc(responseReadiness.score)}/100`}</b>
      <span>Контракты</span><b>${fmt(summary.contractCount)} всего · ${fmt(strictContracts.length)} уверенных</b>
      <span>Evidence claims</span><b>${fmt(countOf(evidenceCounts, "proven"))} proven · ${fmt(countOf(evidenceCounts, "partial"))} partial · ${fmt(countOf(evidenceCounts, "candidate"))} candidate · ${fmt(countOf(evidenceCounts, "ambiguous"))} ambiguous</b>
      <span>Response semantics</span><b>${fmt(countOf(responseCounts, "synchronous_http_response") + countOf(responseCounts, "synchronous_query_response"))} sync · ${fmt(countOf(responseCounts, "same_payload_rq_rs"))} rq+rs · ${fmt(countOf(responseCounts, "request_event_no_response_proof"))} no proof</b>
      <span>Service edges</span><b>${fmt(summary.serviceEdgeCount)} всего · ${fmt(allData.tierCounts.confirmed)} уверенных</b>
      <span>rq+rs модели</span><b>${fmt(sameModel.length)}</b>
      <span>One-way без ответа</span><b>${fmt(missingResponses.length)}</b>
      <span>Малые маппинги</span><b>${fmt(tinyContracts.length)} контрактов ≤2 поля</b>
      <span>Conflicts</span><b>${fmt(conflicts.summary?.total || conflicts.total || 0)}</b>
    </div>
    <div class="detail-section">
      <h3>Односторонние вызовы без доказанного response</h3>
      <table class="table">
        <thead><tr><th>Маршрут</th><th>Payload</th><th>Proof</th><th>Причина</th></tr></thead>
        <tbody>${missingResponses.slice(0, 80).map(({ call, response }) => `
          <tr>
            <td>${esc(call.sourceLabel)} → ${esc(call.targetLabel)}</td>
            <td>${esc(call.payload)}</td>
            <td>${esc(call.proof)}</td>
            <td>${esc(response.detail)}</td>
          </tr>
        `).join("") || `<tr><td colspan="4" class="muted">Для показанных данных все one-way получили объяснение.</td></tr>`}</tbody>
      </table>
    </div>
    <div class="detail-section">
      <h3>Модели request+response в одном DTO/schema</h3>
      <table class="table">
        <thead><tr><th>Маршрут</th><th>Payload</th><th>Поля</th><th>Proof</th></tr></thead>
        <tbody>${sameModel.slice(0, 80).map(({ call }) => `
          <tr>
            <td>${esc(call.sourceLabel)} → ${esc(call.targetLabel)}</td>
            <td>${esc(call.payload)}</td>
            <td>${fmt(call.fieldCount)}</td>
            <td>${esc(call.proof)}</td>
          </tr>
        `).join("") || `<tr><td colspan="4" class="muted">rq+rs модели не найдены.</td></tr>`}</tbody>
      </table>
    </div>
    <div class="detail-section">
      <h3>Top blockers</h3>
      <table class="table">
        <tbody>${blockers.map((item) => `
          <tr><td>${esc(item.label || item.key || "")}</td><td>${fmt(item.count)}</td></tr>
        `).join("") || `<tr><td class="muted">Блокеры не записаны.</td></tr>`}</tbody>
      </table>
    </div>
    <div class="detail-section">
      <h3>Trust gates</h3>
      <table class="table">
        <tbody>${gateRows || `<tr><td class="muted">Trust gates не записаны в этом снапшоте.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

// ===== Путь потока: маршрут между двумя сервисами по доказанным рёбрам =====

const {
  claimStatus: claimStatusLabel,
  contractProof: contractProofLabel,
  direction: directionLabel,
  orderReason: orderReasonLabel,
  qualityTier: qualityTierLabel,
  readinessStatus: readinessStatusLabel,
  responseExplanation,
  responseProof: responseProofLabel,
  transport: transportLabel,
} = window.AIProfilerLabels;
const { TIER_RANK, findServicePaths, pathParticipants } = globalThis.AIProfilerJourneyPaths;

function pathCalls() {
  const calls = buildSequenceData(1, { applyFilters: false }).calls;
  return state.path.confidentOnly ? calls.filter((call) => call.tier === "confirmed") : calls;
}

function ensurePathDefaults(participants, calls) {
  const ids = new Set(participants.map((p) => p.id));
  if (!ids.has(state.path.from) || !ids.has(state.path.to) || state.path.from === state.path.to) {
    const targets = new Set(calls.map((c) => c.targetService));
    const entries = participants.filter((p) => !targets.has(p.id));
    state.path.from = entries[0]?.id || participants[0]?.id || "";
    const collector = participants.find((p) => /collector/i.test(p.id));
    state.path.to = collector && collector.id !== state.path.from
      ? collector.id
      : (participants.find((p) => p.id !== state.path.from)?.id || "");
    state.path.selected = 0;
  }
}

function renderPathSelects(participants) {
  const options = (selected) => participants
    .map((p) => `<option value="${esc(p.id)}" ${p.id === selected ? "selected" : ""}>${esc(p.label)}</option>`)
    .join("");
  $("path-from").innerHTML = options(state.path.from);
  $("path-to").innerHTML = options(state.path.to);
}

function renderPathStep(call, index, path) {
  const order = call.order;
  const purpose = order?.purpose
    ? `<p class="path-purpose"><b>Зачем:</b> ${esc(order.purpose)}</p>`
    : `<p class="path-purpose muted">Бизнес-назначение не рассчитано (нужна сборка с --llm).</p>`;
  const proofTierLabels = { proven: "ответ доказан", forward: "forward", weak: "ответ слабый", none: "ответа нет" };
  const handoff = index > 0
    ? `<p class="path-handoff muted">${esc(call.sourceLabel)} получил ${esc(path[index - 1].payload)} на шаге ${index} и передаёт дальше:</p>`
    : "";
  return `
    <article class="path-step tier-${esc(call.tier)}">
      <div class="path-step-no">${index + 1}</div>
      <div class="path-step-body">
        ${handoff}
        <div class="path-step-head">
          <strong>${esc(call.sourceLabel)} → ${esc(call.targetLabel)}</strong>
          <span class="badge">${esc(transportLabel(call.transport))}</span>
          <span class="badge">${esc(tierText(call.tier))}</span>
          ${call.proofTier ? `<span class="badge proof-${esc(call.proofTier)}">${esc(proofTierLabels[call.proofTier] || call.proofTier)}</span>` : ""}
        </div>
        <div class="path-step-payload mono">${esc(call.payload)}</div>
        ${(call.edge?.negativeEvidence || []).map((ne) => `
          <p class="path-purpose"><span class="badge warn">⚠ типы расходятся: ${esc(ne.sourcePayload || "?")} vs ${esc(ne.targetPayload || "?")} — слабая гипотеза</span></p>`).join("")}
        <div class="path-step-meta muted">
          ${fmt(call.fieldCount)} пол. · ${esc(call.qualityTier)}
          ${order ? ` · процесс: ${esc(order.processName || order.processId)}` : " · вне процессов"}
          <a href="#" class="path-to-seq" data-call-id="${esc(call.id)}">открыть в сиквенсе →</a>
        </div>
        ${purpose}
      </div>
    </article>
  `;
}

function renderPathView() {
  if (!state.graph) {
    $("path-canvas").innerHTML = `<div class="empty">Граф ещё не загружен.</div>`;
    return;
  }
  const calls = pathCalls();
  const participants = pathParticipants(buildSequenceData(1, { applyFilters: false }).calls);
  ensurePathDefaults(participants, calls);
  renderPathSelects(participants);

  const urlParams = new URLSearchParams(window.location.search);
  urlParams.set("pfrom", state.path.from);
  urlParams.set("pto", state.path.to);
  window.history.replaceState({}, "", `${window.location.pathname}?${urlParams.toString()}`);

  const paths = findServicePaths(calls, state.path.from, state.path.to);
  if (state.path.selected >= paths.length) state.path.selected = 0;
  const active = paths[state.path.selected];
  const fromLabel = sequenceServiceName(state.path.from);
  const toLabel = sequenceServiceName(state.path.to);

  $("path-summary").innerHTML = paths.length
    ? `${esc(fromLabel)} → ${esc(toLabel)}: найдено путей — ${fmt(paths.length)}, показан ${state.path.selected === 0 ? "лучший" : `№${state.path.selected + 1}`} (${active.length} шаг${active.length === 1 ? "" : active.length < 5 ? "а" : "ов"})`
    : `${esc(fromLabel)} → ${esc(toLabel)}: путь не найден${state.path.confidentOnly ? " — попробуйте снять «только уверенные»" : ""}`;

  if (!paths.length) {
    $("path-canvas").innerHTML = `<div class="empty">Между этими сервисами нет пути по текущим рёбрам.<br>${state.path.confidentOnly ? "Снимите «только уверенные» — кандидатные рёбра могут замкнуть маршрут." : "Попробуйте поменять направление (⇄)."}</div>`;
    $("path-side").innerHTML = "";
    return;
  }

  const chips = [
    `<span class="path-chip">${esc(active[0].sourceLabel)}</span>`,
    ...active.map((call) => `<span class="path-arrow tier-${esc(call.tier)}" title="${esc(call.payload)}">→</span><span class="path-chip">${esc(call.targetLabel)}</span>`),
  ].join("");

  const presets = (state.graph?.processes || [])
    .filter((proc) => (proc.steps || []).length)
    .slice(0, 4)
    .map((proc) => {
      const lastStep = proc.steps[proc.steps.length - 1];
      return { from: proc.entryService, to: lastStep.targetService, label: `${sequenceServiceName(proc.entryService)} → ${sequenceServiceName(lastStep.targetService)}` };
    })
    .filter((p) => p.from !== p.to);

  $("path-canvas").innerHTML = `
    ${presets.length ? `<div class="path-presets">${presets.map((p) => `
      <button class="mini-btn path-preset" data-from="${esc(p.from)}" data-to="${esc(p.to)}" type="button">⚡ ${esc(p.label)}</button>
    `).join("")}</div>` : ""}
    <div class="path-chips">${chips}</div>
    <div class="path-timeline">${active.map((call, i) => renderPathStep(call, i, active)).join("")}</div>
  `;
  $("path-canvas").querySelectorAll(".path-preset").forEach((el) => {
    el.onclick = () => {
      state.path.from = el.dataset.from || "";
      state.path.to = el.dataset.to || "";
      state.path.selected = 0;
      renderPathView();
    };
  });

  const worstTier = Math.max(...active.map((c) => TIER_RANK[c.tier] ?? 4));
  const alt = paths.map((path, i) => `
    <button class="path-alt ${i === state.path.selected ? "selected" : ""}" data-path-index="${i}" type="button">
      <strong>№${i + 1} · ${path.length} шаг${path.length === 1 ? "" : path.length < 5 ? "а" : "ов"}</strong>
      <span>${path.map((c) => esc(c.targetLabel)).join(" → ")}</span>
      <span class="muted">худшее звено: ${esc(tierText(Object.keys(TIER_RANK)[Math.max(...path.map((c) => TIER_RANK[c.tier] ?? 4))] || "candidate"))}</span>
    </button>
  `).join("");

  $("path-side").innerHTML = `
    <h3>Альтернативные пути (${fmt(paths.length)})</h3>
    <div class="path-alts">${alt}</div>
    <p class="muted path-note">Порядок шагов — каузальная цепочка по коду: следующий вызов возможен только после доставки предыдущего.
    Худшее звено пути: <b>${esc(tierText(Object.keys(TIER_RANK)[worstTier] || "candidate"))}</b>.
    Ветвления и параллельные шаги смотрите в сиквенсе.</p>
  `;

  $("path-side").querySelectorAll(".path-alt").forEach((el) => {
    el.onclick = () => {
      state.path.selected = Number(el.dataset.pathIndex || 0);
      renderPathView();
    };
  });
  $("path-canvas").querySelectorAll(".path-to-seq").forEach((el) => {
    el.onclick = (event) => {
      event.preventDefault();
      state.sequence.selectedId = el.dataset.callId || "";
      state.sequence.confidentOnly = false;
      const toggle = $("sequence-confident-only");
      if (toggle) toggle.checked = false;
      setView("sequence");
    };
  });
}

const RECONSTRUCTION_STATUS = {
  implemented: { label: "реализация найдена", className: "implemented" },
  code_only: { label: "найдено только в коде", className: "code-only" },
  candidate: { label: "найден кандидат", className: "candidate" },
  implementation_gap: { label: "реализация не найдена", className: "gap" },
  conflict: { label: "противоречие", className: "conflict" },
};

const RECONSTRUCTION_COMPARISON_STATUS = {
  confirmed_code_and_registry: "подтверждено кодом и Excel",
  code_only: "найдено только в коде",
  expected_registry_only: "ожидается по Excel, код не найден",
  candidate: "найден похожий кандидат",
  conflict: "обнаружено противоречие",
};

const RECONSTRUCTION_GAP_DISPOSITION = {
  implemented: "реализация подтверждена",
  candidate_review: "есть технический кандидат",
  evidence_conflict: "доказательства противоречат друг другу",
  implementation_not_found: "оба сервиса загружены, вызов не найден",
  participant_alias_gap: "нужно разрешить имя участника",
  external_corpus_boundary: "одна сторона находится вне загруженного корпуса",
  component_not_loaded: "компонент явно указан, но его код не загружен",
  outside_loaded_corpus: "обе стороны находятся вне загруженного корпуса",
};

const reconstructionController = globalThis.AIProfilerReconstructionController.create({
  state,
  getElement: $,
  request: api,
  esc,
  fmt,
  uniq,
  mappingViewUrl,
  download,
  loadSnapshots,
  showError,
  statuses: RECONSTRUCTION_STATUS,
  comparisonStatuses: RECONSTRUCTION_COMPARISON_STATUS,
  gapDispositions: RECONSTRUCTION_GAP_DISPOSITION,
});
const setReconstructionMode = reconstructionController.setMode;
const exportReconstruction = reconstructionController.exportProcess;
const renderReconstructionView = reconstructionController.renderView;
function renderArchitectureView() {
  const root = $("architecture-panel");
  const data = state.graph || {};
  const renderer = window.AIProfilerArchitectureView;
  if (!renderer) return showError(new Error("Модуль экрана архитектуры не загружен"));
  const rendered = renderer.render(data, { esc, fmt, formatBytes });
  root.innerHTML = rendered.html;
  $("architecture-export-mermaid")?.addEventListener("click", () => exportArchitecture("mermaid", data, rendered.tableLabels));
  $("architecture-export-drawio")?.addEventListener("click", () => exportArchitecture("drawio", data, rendered.tableLabels));
}

function exportArchitecture(kind, data, tableLabels) {
  const exporter = window.AIProfilerArchitectureExport;
  if (!exporter) return showError(new Error("Модуль экспорта архитектуры не загружен"));
  const safeName = window.AIProfilerArchitectureView?.fileStem(data) || "snapshot";
  if (kind === "drawio") {
    return download(`ai_profiler_architecture_${safeName}.drawio`, new Blob([exporter.buildDrawio(data, tableLabels)], { type: "application/xml;charset=utf-8" }));
  }
  return download(`ai_profiler_architecture_${safeName}.mmd`, new Blob([exporter.buildMermaid(data, tableLabels)], { type: "text/plain;charset=utf-8" }));
}

function renderCurrentView() {
  renderMetrics();
  if (state.view === "briefing") renderBriefing();
  if (state.view === "overview") renderOverview();
  if (state.view === "reconstruction") renderReconstructionView();
  if (state.view === "sequence") renderSequenceView();
  if (state.view === "path") renderPathView();
  if (state.view === "mappings") renderMappingsView();
  if (state.view === "models") renderModelsView();
  if (state.view === "fields") renderFieldsView();
  if (state.view === "gaps") renderGapsView();
  if (state.view === "architecture") renderArchitectureView();
}

async function loadSnapshots() {
  const payload = await api("/api/snapshots");
  state.snapshots = payload.items || [];
  const select = $("snapshot-select");
  select.innerHTML = state.snapshots.map((snapshot) => `
    <option value="${esc(snapshot.id)}">${esc(snapshot.name)} · ${fmt(snapshot.serviceCount)} сервисов · ${fmt(snapshot.contractCount)} вариантов</option>
  `).join("");
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("snapshot");
  const selected = state.snapshots.find((snapshot) => snapshot.id === requested) || state.snapshots[0];
  if (!selected) throw new Error("system_lineage.json не найден в reports_system");
  select.value = selected.id;
  await loadSnapshot(selected.id);
}

async function loadSnapshot(snapshotId) {
  const snapshot = state.snapshots.find((item) => item.id === snapshotId);
  state.snapshot = snapshot;
  const reconstructionOnly = state.view === "reconstruction";
  const endpoint = reconstructionOnly
    ? `/api/snapshots/${encodeURIComponent(snapshot.id)}/views/reconstruction`
    : `/api/snapshots/${encodeURIComponent(snapshot.id)}/sequence`;
  state.graph = await api(endpoint);
  state.graphMode = reconstructionOnly ? "reconstruction" : "sequence";
  state.loadedViews = new Set(reconstructionOnly
    ? ["reconstruction"]
    : ["sequence", "path", "overview", "reconstruction"]);
  state.contractDetailLoads.clear();
  const params = new URLSearchParams(window.location.search);
  state.reconstruction.mode = ["business", "implementation", "compare"].includes(params.get("reconMode"))
    ? params.get("reconMode")
    : "compare";
  state.reconstruction.processId = params.get("businessProcess") || "";
  state.reconstruction.selectedStepId = params.get("businessStep") || "";
  state.reconstruction.aiQueueProcessId = "";
  state.reconstruction.aiQueue = null;
  state.reconstruction.aiVerification = null;
  state.sequence.diagramMode = params.get("diagram") === "process" ? "process" : "sequence";
  const availableGroups = (state.graph?.interactionBoundaryInventory?.groups || []).map((item) => item.group);
  const scopeSelect = $("sequence-scope");
  scopeSelect.innerHTML = [
    `<option value="all">Все найденные связи</option>`,
    `<option value="cross">Только межФП</option>`,
    ...availableGroups.map((group) => `<option value="group:${esc(group)}">Внутри ФП: ${esc(group)}</option>`),
  ].join("");
  const requestedScope = params.get("scope") || "all";
  const allowedScopes = new Set(["all", "cross", ...availableGroups.map((group) => `group:${group}`)]);
  state.sequence.scope = allowedScopes.has(requestedScope) ? requestedScope : "all";
  scopeSelect.value = state.sequence.scope;
  const requestedProcess = params.get("process") || "";
  const requestedStep = Number(params.get("step") || 0);
  const requestedMapStageRaw = params.get("mapStage");
  const requestedMapStage = requestedMapStageRaw == null ? null : Number(requestedMapStageRaw);
  const requestedMapView = params.get("mapView");
  const requestedMapFlow = params.get("mapFlow");
  const directProcess = (state.graph?.processes || []).find((process) => process.processId === requestedProcess);
  state.sequence.processId = directProcess?.processId || "";
  state.sequence.processMembers = directProcess ? new Set(directProcess.memberServices || []) : null;
  state.sequence.mapStage = directProcess && Number.isFinite(requestedMapStage) ? requestedMapStage : null;
  state.sequence.mapView = ["overview", "stage", "diagnostic"].includes(requestedMapView)
    ? requestedMapView
    : (requestedStep ? "diagnostic" : "overview");
  state.sequence.mapFlow = ["all", "main", "conditional", "async", "exception"].includes(requestedMapFlow)
    ? requestedMapFlow
    : "all";
  state.sequence.selectedStage = state.sequence.mapView === "stage" ? state.sequence.mapStage : null;
  const directCalls = directProcess && requestedStep
    ? buildSequenceData(1, { applyFilters: false }).calls
    : [];
  state.sequence.selectedId = directCalls.find((call) => Number(call.order?.step) === requestedStep)?.id || "";
  state.mappings.selectedId = "";
  state.mappings.filter = params.get("mapping") || "";
  const mappingFilter = $("mapping-filter");
  if (mappingFilter) mappingFilter.value = state.mappings.filter;
  state.mappings.csvPreview = null;
  state.mappings.csvPreviewFor = "";
  $("api-state").textContent = "online";
  setView(state.view);
  if (state.view === "sequence" && state.sequence.diagramMode === "process" && directProcess) {
    requestAnimationFrame(() => fitSequence({ readable: true }));
  }
}

function bindUi() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.onclick = () => setView(button.dataset.view);
  });
  $("refresh-btn").onclick = () => loadSnapshots().catch(showError);
  $("snapshot-select").onchange = (event) => loadSnapshot(event.target.value).catch(showError);
  $("reconstruction-process").onchange = (event) => {
    state.reconstruction.processId = event.target.value;
    state.reconstruction.selectedStepId = "";
    state.reconstruction.aiQueueProcessId = "";
    state.reconstruction.aiQueue = null;
    state.reconstruction.aiVerification = null;
    const params = new URLSearchParams(window.location.search);
    params.set("businessProcess", state.reconstruction.processId);
    params.delete("businessStep");
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
    renderReconstructionView();
  };
  $("reconstruction-mode-business").onclick = () => setReconstructionMode("business");
  $("reconstruction-mode-implementation").onclick = () => setReconstructionMode("implementation");
  $("reconstruction-mode-compare").onclick = () => setReconstructionMode("compare");
  $("diagram-mode-sequence").onclick = () => setDiagramMode("sequence");
  $("diagram-mode-process").onclick = () => setDiagramMode("process");
  $("seq-agent").onclick = () => setInspectorTab(state.agent.tab === "agent" ? "detail" : "agent");
  $("inspector-tab-detail").onclick = () => setInspectorTab("detail");
  $("inspector-tab-agent").onclick = () => setInspectorTab("agent");
  $("inspector-collapse").onclick = () => setInspectorCollapsed(!state.agent.collapsed);
  document.querySelectorAll("[data-agent-question]").forEach((button) => {
    button.onclick = () => askProcessAgent(button.dataset.agentQuestion);
  });
  $("agent-form").onsubmit = (event) => {
    event.preventDefault();
    askProcessAgent($("agent-question").value);
  };
  $("sequence-filter").oninput = (event) => {
    state.sequence.filter = event.target.value;
    renderSequenceView();
  };
  $("sequence-confident-only").onchange = (event) => {
    state.sequence.confidentOnly = event.target.checked;
    renderSequenceView();
  };
  $("sequence-complete-only").onchange = (event) => {
    state.sequence.completeOnly = event.target.checked;
    renderSequenceView();
  };
  $("sequence-scope").onchange = (event) => {
    focusSequenceScope(event.target.value);
  };
  $("mapping-filter").oninput = (event) => {
    state.mappings.filter = event.target.value;
    state.mappings.csvPreview = null;
    state.mappings.csvPreviewFor = "";
    renderMappingsView();
  };
  $("mapping-confident-only").onchange = (event) => {
    state.mappings.confidentOnly = event.target.checked;
    state.mappings.csvPreview = null;
    state.mappings.csvPreviewFor = "";
    renderMappingsView();
  };
  $("seq-zoom-in").onclick = () => setSequenceZoom(state.sequence.zoom + 0.1);
  $("seq-zoom-out").onclick = () => setSequenceZoom(state.sequence.zoom - 0.1);
  $("seq-fit").onclick = fitSequence;
  $("seq-export-html").onclick = () => exportSequence("html");
  $("seq-export-package").onclick = () => exportSequence("package");
  $("seq-export-svg").onclick = () => exportSequence("svg");
  $("seq-export-png").onclick = () => exportSequence("png");
  $("seq-export-json").onclick = () => exportSequence("json");
  $("seq-export-puml").onclick = () => exportSequence("puml");
  $("reconstruction-export-html").onclick = () => exportReconstruction("html");
  $("reconstruction-export-package").onclick = () => exportReconstruction("package");
  $("seq-focus").onclick = () => {
    document.body.classList.toggle("focus-mode");
    renderSequenceView();
  };
  $("path-from").onchange = (event) => {
    state.path.from = event.target.value;
    state.path.selected = 0;
    renderPathView();
  };
  $("path-to").onchange = (event) => {
    state.path.to = event.target.value;
    state.path.selected = 0;
    renderPathView();
  };
  $("path-swap").onclick = () => {
    [state.path.from, state.path.to] = [state.path.to, state.path.from];
    state.path.selected = 0;
    renderPathView();
  };
  $("path-confident-only").onchange = (event) => {
    state.path.confidentOnly = event.target.checked;
    state.path.selected = 0;
    renderPathView();
  };
}

function showError(error) {
  $("api-state").textContent = "error";
  const message = esc(error?.message || error);
  for (const id of ["briefing-panel", "overview-panel", "reconstruction-board", "sequence-canvas", "models-panel", "fields-panel", "gaps-panel"]) {
    const el = $(id);
    if (el) el.innerHTML = `<div class="empty">Ошибка: ${message}</div>`;
  }
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  state.demo = params.get("demo") === "1";
  document.body.classList.toggle("demo-mode", state.demo);
  if (state.demo) {
    const labels = { briefing: "Старт", reconstruction: "Excel ↔ код", sequence: "Между ФП", mappings: "Поля моделей", gaps: "Что не готово" };
    document.querySelectorAll(".nav-item").forEach((item) => {
      if (labels[item.dataset.view]) item.textContent = labels[item.dataset.view];
    });
  }
  bindUi();
  state.path.from = params.get("pfrom") || "";
  state.path.to = params.get("pto") || "";
  setView(params.get("view") || "sequence");
  try {
    await loadSnapshots();
  } catch (error) {
    showError(error);
  }
}

init();
