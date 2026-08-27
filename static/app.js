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
    mode: "facts",
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
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[ch]));
const fmt = (value) => Number(value || 0).toLocaleString("ru-RU");
const formatBytes = (value) => {
  let size = Number(value || 0);
  const units = ["Б", "КБ", "МБ", "ГБ"];
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
};
const pluralRu = (value, one, few, many) => {
  const count = Math.abs(Number(value || 0)) % 100;
  const last = count % 10;
  if (count > 10 && count < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
};
const countOf = (value, key) => Number((value || {})[key] || 0);
const norm = (value) => String(value || "").replace(/[^a-z0-9]+/gi, "").toLowerCase();
const uniq = (items) => [...new Set((items || []).filter(Boolean))];
const processNarrativeSummary = (value) => {
  const text = String(value || "").trim();
  const gapMarker = text.search(/\s+(?:не подтверждено|неподтверждено|unconfirmed|gaps?):\s*/i);
  return gapMarker >= 0 ? text.slice(0, gapMarker).trim() : text;
};
const mappingCoverageLabel = (mapping = {}) => {
  const source = `${fmt(mapping.sourceMappedFieldCount)}/${fmt(mapping.sourceSchemaFieldCount)}`;
  const target = `${fmt(mapping.targetMappedFieldCount)}/${fmt(mapping.targetSchemaFieldCount)}`;
  if (mapping.coverageClass === "consumer_projection_complete") {
    return `полный для получателя · ${target} · ${fmt(mapping.unconsumedTransmittedFieldCount)} переданных полей не используются`;
  }
  if (mapping.coverageClass === "consumer_compatible_with_defaults") {
    return `совместим · ${fmt(mapping.optionalConsumedFieldNotTransmittedCount)} необязательных полей имеют значение по умолчанию · ${source} → ${target}`;
  }
  if (mapping.coverageClass === "target_binding_unresolved") {
    return `кандидат · endpoint получателя не подтверждён · ${source} → ${target}`;
  }
  if (mapping.coverageClass === "consumer_expectation_gap") {
    return `разрыв контракта · не передано ${fmt(mapping.provenMissingConsumedFieldCount)} читаемых полей · ${source} → ${target}`;
  }
  if (mapping.coverageClass === "consumer_field_absence_unverified") {
    return `нужно проверить · ${fmt(mapping.observedConsumedFieldNotTransmittedCount)} читаемых полей не передаются, но ошибка не доказана · ${source} → ${target}`;
  }
  if (mapping.coverageClass === "declared_target_contract_gap") {
    return `различие деклараций · чтение отсутствующих полей не доказано · ${source} → ${target}`;
  }
  if (mapping.coverageClass === "bilateral_gap") {
    return `доказанный разрыв и лишние поля · ${source} → ${target}`;
  }
  if (mapping.coverageClass === "bilateral_inventory_gap") {
    return `инвентари моделей различаются · runtime-разрыв не доказан · ${source} → ${target}`;
  }
  if (mapping.coverageClass === "unresolved_field_identity") {
    return `транспорт найден · идентичность полей не восстановлена · ${fmt(mapping.rowCount)} строк`;
  }
  if (mapping.status === "partial" && Number(mapping.unresolvedRowCount)) {
    return `частичный · ${fmt(mapping.resolvedFieldRowCount ?? mapping.leafRows)} пар подтверждено, ${fmt(mapping.unresolvedRowCount)} не разрешено`;
  }
  if (mapping.coverageStatus === "full") return `полный по физическим схемам · ${source} → ${target}`;
  if (mapping.coverageStatus === "partial" && Number(mapping.resolvedFieldRowCount ?? mapping.leafRows)) {
    return `частичный · ${source} → ${target}`;
  }
  if (mapping.coverageStatus === "partial" && Number(mapping.rowCount)) {
    return `транспорт зафиксирован · ${fmt(mapping.rowCount)} строк инвентаризации · пары полей не доказаны`;
  }
  if (mapping.coverageStatus === "partial") return `частичный · ${source} → ${target}`;
  if (mapping.coverageStatus === "missing") return "пополевый маппинг не построен";
  return `${fmt(mapping.leafRows)} строк · полнота не доказана`;
};
const contractMapping = (contract = {}) => contract.mapping || contract.crossServiceDataSurf || contract.dataSurf || {};
const processCorpusClosed = (process = {}) => process.corpusClosureComplete ?? process.assemblyComplete !== false;
const processClosureLabel = (process = {}) => ({
  closed: "строго замкнут",
  open_external_dependency: `${fmt(process.unloadedDependencyCount || 0)} выходов в незагруженные сервисы`,
  internal_gap: `${fmt(process.internalGapCount || 0)} внутренних разрывов`,
  incoming_context_gap: "не собран путь входящего отправителя",
  unknown_gap: `${fmt(process.unknownGapCount || 0)} неразобранных выходов`,
}[process.closureStatus] || (process.assemblyComplete === false ? "есть незакрытые выходы" : "наблюдаемые границы замкнуты"));
const mappingDirectionsLabel = (mapping = {}) => {
  const directions = mapping.directions || [];
  if (directions.includes("request") && directions.includes("response")) return "запрос и синхронный ответ";
  if (directions.includes("response")) return "синхронный ответ";
  return "запрос";
};

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

function setInspectorTab(tab) {
  const next = tab === "agent" ? "agent" : "detail";
  state.agent.tab = next;
  const detail = $("sequence-detail");
  const agent = $("process-agent");
  const detailTab = $("inspector-tab-detail");
  const agentTab = $("inspector-tab-agent");
  if (detail) detail.hidden = next !== "detail";
  if (agent) agent.hidden = next !== "agent";
  detailTab?.classList.toggle("active", next === "detail");
  agentTab?.classList.toggle("active", next === "agent");
  detailTab?.setAttribute("aria-selected", next === "detail" ? "true" : "false");
  agentTab?.setAttribute("aria-selected", next === "agent" ? "true" : "false");
  $("seq-agent")?.classList.toggle("active", next === "agent");
}

function setInspectorCollapsed(collapsed) {
  state.agent.collapsed = Boolean(collapsed);
  const layout = document.querySelector(".sequence-layout");
  const button = $("inspector-collapse");
  layout?.classList.toggle("inspector-collapsed", state.agent.collapsed);
  if (button) {
    button.textContent = state.agent.collapsed ? "‹" : "›";
    button.title = state.agent.collapsed ? "Развернуть инспектор" : "Свернуть инспектор";
    button.setAttribute("aria-label", button.title);
  }
  requestAnimationFrame(() => fitSequence());
}

function selectedAgentContext() {
  const process = state.sequence.processId
    ? (state.graph?.processes || []).find((item) => item.processId === state.sequence.processId)
    : null;
  const call = state.sequence.data?.calls?.find((item) => item.id === state.sequence.selectedId) || null;
  return {
    process,
    call,
    processId: process?.processId || "",
    contractId: call?.isBridge ? "" : (call?.contractId || ""),
    stage: state.sequence.selectedStage || Number(call?.order?.stage || 0) || null,
  };
}

function updateAgentContext() {
  const label = $("agent-context");
  if (!label) return;
  const { process, call, stage } = selectedAgentContext();
  label.textContent = [
    process?.name || "весь снимок",
    stage ? `этап ${stage}` : "",
    call ? `${call.sourceLabel} → ${call.targetLabel}` : "",
  ].filter(Boolean).join(" · ");
}

function agentCitationHref(citation) {
  if (citation.contractId && state.snapshot?.id) {
    const params = new URLSearchParams({
      view: "mappings",
      snapshot: state.snapshot.id,
      mapping: citation.contractId,
    });
    return `${window.location.pathname}?${params.toString()}`;
  }
  const artifact = String(citation.artifact || "");
  if (!artifact) return "";
  if (artifact.startsWith("/")) return artifact;
  return `/file?path=${encodeURIComponent(artifact)}`;
}

function renderAgentStageBrief(brief) {
  const metrics = (brief.metrics || []).map((item) => `
    <div class="agent-stage-metric"><b>${fmt(item.value)}</b><span>${esc(item.label)}</span></div>`).join("");
  const actions = (brief.actions || []).map((action) => {
    const details = [
      action.operation ? `метод ${action.operation}` : "",
      action.transport,
      action.payload ? `модель ${action.payload}` : "",
      action.ordering,
    ].filter(Boolean).map((item) => `<span>${esc(item)}</span>`).join("");
    return `<article class="agent-stage-action ${action.proven ? "proven" : "limited"}">
      <div class="agent-stage-action-head">
        <b>${esc(action.title)}</b>
        ${action.variantCount > 1 ? `<span class="badge info">${fmt(action.variantCount)} варианта</span>` : ""}
      </div>
      <div class="agent-stage-action-meta">${details}</div>
      <p>${esc(action.response)}</p>
      <div class="agent-stage-action-foot">
        <span>Связи полей: ${fmt(action.fieldLinkCount)}</span>
        ${action.readiness != null ? `<span>готовность ${fmt(action.readiness)}/100</span>` : ""}
      </div>
    </article>`;
  }).join("");
  const evidence = (brief.evidence || []).map((item) => `<li>${esc(item)}</li>`).join("");
  const limitations = (brief.limitations || []).map((item) => `<li>${esc(item)}</li>`).join("");
  return `<section class="agent-stage-brief">
    <h3>${esc(brief.title)}</h3>
    <p class="agent-stage-summary">${esc(brief.summary)}</p>
    <div class="agent-stage-metrics">${metrics}</div>
    <h4>Действия этапа</h4>
    <div class="agent-stage-actions">${actions}</div>
    <div class="agent-stage-findings">
      <section><h4>Что подтверждено</h4><ul>${evidence}</ul></section>
      ${limitations ? `<section class="limitations"><h4>Что пока нельзя утверждать</h4><ul>${limitations}</ul></section>` : ""}
    </div>
  </section>`;
}

function renderAgentConversation() {
  const host = $("agent-conversation");
  if (!host) return;
  if (!state.agent.history.length) {
    host.innerHTML = `<div class="agent-empty">Ответ строится только по выбранному снимку. GigaChat формулирует текст, но не добавляет факты без ссылок.</div>`;
    return;
  }
  host.innerHTML = state.agent.history.map((entry) => {
    const citations = (entry.response?.citations || []).slice(0, 18).map((citation) => {
      const href = agentCitationHref(citation);
      const label = `${citation.type || "fact"}: ${citation.label || citation.id || "факт"}`;
      return `<li>${href ? `<a href="${esc(href)}">${esc(label)}</a>` : esc(label)}${citation.sourceFile ? ` · ${esc(citation.sourceFile)}${citation.sourceLine ? `:${fmt(citation.sourceLine)}` : ""}` : ""}</li>`;
    }).join("");
    const mode = entry.response?.mode === "llm" ? "GigaChat по найденным фактам" : "Детерминированный ответ";
    const stageBrief = entry.response?.stageBrief ? renderAgentStageBrief(entry.response.stageBrief) : "";
    const answer = stageBrief
      ? (entry.response?.mode === "llm" ? `<div class="agent-answer agent-synthesis"><b>Вывод GigaChat</b>${esc(entry.response?.answer || "Ответ не получен")}</div>` : "")
      : `<div class="agent-answer">${esc(entry.response?.answer || "Ответ не получен")}</div>`;
    return `<article class="agent-message">
      <div class="question">${esc(entry.question)}</div>
      <div class="agent-answer-head"><b>${esc(mode)}</b><span>${fmt(entry.response?.citations?.length || 0)} оснований</span></div>
      ${entry.response?.llmHint ? `<div class="agent-warning">${esc(entry.response.llmHint)}</div>` : ""}
      ${stageBrief}
      ${answer}
      ${citations ? `<details class="ai-evidence"><summary>Проверяемые основания</summary><ul class="agent-citations">${citations}</ul></details>` : `<div class="agent-warning">В ответе нет адресных оснований. Используйте его только как указатель на пробел.</div>`}
    </article>`;
  }).join("");
  const latest = host.lastElementChild;
  host.scrollTop = latest ? Math.max(0, latest.offsetTop - host.offsetTop) : 0;
}

async function askProcessAgent(question) {
  const text = String(question || "").trim();
  if (!text || state.agent.loading || !state.snapshot?.id) return;
  const context = selectedAgentContext();
  state.agent.loading = true;
  const submit = $("agent-submit");
  if (submit) {
    submit.disabled = true;
    submit.textContent = state.agent.mode === "llm" ? "Спрашиваю GigaChat…" : "Ищу факты…";
  }
  try {
    const response = await api("/api/agent/ask", {
      method: "POST",
      body: JSON.stringify({
        snapshotId: state.snapshot.id,
        question: text,
        mode: state.agent.mode,
        processId: context.processId,
        contractId: context.contractId,
        stage: context.stage,
      }),
    });
    state.agent.history.push({ question: text, response });
    state.agent.history = state.agent.history.slice(-8);
    const input = $("agent-question");
    if (input) input.value = "";
    renderAgentConversation();
  } catch (error) {
    state.agent.history.push({
      question: text,
      response: { answer: `Не удалось получить ответ: ${error.message}`, citations: [], mode: "facts" },
    });
    renderAgentConversation();
  } finally {
    state.agent.loading = false;
    if (submit) {
      submit.disabled = false;
      submit.textContent = "Спросить";
    }
  }
}

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
  state.sequence.selectedRegionId = "";
  state.sequence.selectedRelationId = "";
  const params = new URLSearchParams(window.location.search);
  if (state.sequence.diagramMode === "process") params.set("diagram", "process");
  else params.delete("diagram");
  params.delete("mapStage");
  window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  renderSequenceView();
}

function updateDiagramModeControls(activeProcess) {
  const processMode = state.sequence.diagramMode === "process";
  $("diagram-mode-sequence")?.classList.toggle("active", !processMode);
  $("diagram-mode-process")?.classList.toggle("active", processMode);
  $("sequence-title").textContent = processMode
    ? (activeProcess ? `Карта процесса: ${activeProcess.name}` : "Карта бизнес-процессов")
    : "Сиквенс межсервисных вызовов";
  $("sequence-canvas")?.classList.toggle("process-map-canvas", processMode);
  $("sequence-canvas")?.setAttribute("aria-label", processMode ? "Карта процесса" : "Сиквенс межсервисных вызовов");
  document.querySelector(".sequence-panel")?.classList.toggle("process-map-active", processMode);
}

function processMapValue(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(", ");
  try { return JSON.stringify(value); } catch (_error) { return String(value); }
}

function renderProcessMapChooser() {
  const canvas = $("sequence-canvas");
  const detail = $("sequence-detail");
  const processes = (state.graph?.processes || [])
    .filter((process) => (process.processIr?.nodes || []).length)
    .sort((a, b) => Number(b.processIr?.nodes?.length || 0) - Number(a.processIr?.nodes?.length || 0));
  canvas.innerHTML = `
    <div class="process-map-picker">
      <div class="process-map-picker-head">
        <b>Выберите процесс</b>
        <span>Карта строится для одной точки входа. Так ветки разных процессов не смешиваются в одну схему.</span>
      </div>
      <div class="process-map-picker-grid">
        ${processes.map((process) => `
          <button type="button" class="process-map-choice" data-process-id="${esc(process.processId)}">
            <strong>${esc(process.name)}</strong>
            <span>${fmt(process.processIr?.nodes?.length || 0)} блоков · ${fmt(process.processIr?.relations?.length || 0)} доказанных переходов</span>
            <small>${esc(processNarrativeSummary(process.narrative || processClosureLabel(process)))}</small>
          </button>
        `).join("") || `<div class="empty">В этом снимке ещё нет processIr для построения карты.</div>`}
      </div>
    </div>`;
  detail.innerHTML = `
    <h3>Что показывает карта</h3>
    <p>Это BPMN-alike представление уже найденного процесса: прямоугольники — межсервисные действия, ромбы — доказанные управляющие участки Java-кода, линии — причинные зависимости.</p>
    <p class="muted">Карта не объявляет объединение статических маршрутов одним production-запуском. Если точный порядок не доказан, это явно останется на схеме и в деталях.</p>`;
  canvas.querySelectorAll(".process-map-choice").forEach((button) => {
    button.onclick = () => {
      const process = processes.find((item) => item.processId === button.dataset.processId);
      if (process) focusProcess(process);
    };
  });
}

function processMapNodeHtml(call) {
  const selected = call.id === state.sequence.selectedId ? "selected" : "";
  if (call.isRegistryBoundary) {
    const boundary = call.registryBoundary || {};
    const evidence = boundary.evidenceStatus === "code_boundary_and_registry"
      ? "кодовая граница + Excel"
      : "ожидаемый вход по Excel";
    return `
      <button type="button" class="process-map-node registry-boundary ${selected}"
        data-call-id="${esc(call.id)}" style="left:${call.processMap.x}px;top:${call.processMap.y}px;width:${call.processMap.width}px;height:${call.processMap.height}px">
        <span class="process-map-node-head">
          <b>${boundary.direction === "inbound" ? "Вход" : "Внешний выход"}</b>
          <span>${esc(call.sourceLabel)} → ${esc(call.targetLabel)}</span>
        </span>
        <strong>${esc(call.payload)}</strong>
        <span class="process-map-node-meta">архитектурный реестр · ${esc(evidence)}</span>
        <span class="process-map-purpose"><i>Бизнес-контур</i>${esc((boundary.businessNames || [])[0] || "Ожидаемое взаимодействие из архитектурного Excel")}</span>
        <span class="process-map-node-badges">
          <em>${fmt((boundary.registryRowIds || []).length)} строк Excel</em>
          <em>${boundary.routeId ? "исходящий вызов найден" : "точка входа ожидается"}</em>
        </span>
      </button>`;
  }
  const synchronous = call.responseSemantics?.isSynchronous || call.responseSemantics?.kind === "reverse_contract";
  const hasPurpose = Boolean(call.order?.purpose);
  const purpose = call.order?.purpose || call.order?.reason || "Описание этого действия ещё не рассчитано";
  const purposeLabel = hasPurpose
    ? (call.order?.purposeSource !== "deterministic" ? "Зачем (ИИ)" : "Зачем")
    : (call.order?.reason ? "Почему здесь" : "Описание");
  const map = call.processMap;
  return `
    <button type="button" class="process-map-node tier-${esc(call.tier)} ${selected}"
      data-call-id="${esc(call.id)}" style="left:${map.x}px;top:${map.y}px;width:${map.width}px;height:${map.height}px">
      <span class="process-map-node-head">
        <b>Шаг ${fmt(call.displayStep || call.order?.step)}</b>
        <span>${esc(call.sourceLabel)} → ${esc(call.targetLabel)}</span>
      </span>
      <strong>${esc(call.payload)}</strong>
      <span class="process-map-node-meta">${esc(transportLabel(call.transport))} · ${synchronous ? "запрос + синхронный ответ" : "передача вперёд"}</span>
      <span class="process-map-purpose"><i>${purposeLabel}</i>${esc(purpose)}</span>
      <span class="process-map-node-badges">
        <em>${fmt(call.fieldCount)} связей полей</em>
        <em>${call.order?.readiness ? `готовность ${fmt(call.order.readiness.score)}/100` : esc(tierText(call.tier))}</em>
      </span>
    </button>`;
}

function processMapGatewayHtml(region) {
  const selected = region.id === state.sequence.selectedRegionId ? "selected" : "";
  return `
    <button type="button" class="process-map-gateway kind-${esc(region.kind)} ${selected}"
      data-region-id="${esc(region.id)}" style="left:${region.x}px;top:${region.y}px"
      title="${esc(region.label)}: открыть условие и ветки">
      <span><i>${esc(region.symbol)}</i></span>
      <small><b>${esc(region.label)}</b><em>${esc(region.scopeLabel || "управление потоком")}</em></small>
    </button>`;
}

function processMapRegionFrameHtml(region) {
  if (!["async_task", "exception"].includes(region.kind) || !region.bounds) return "";
  return `<div class="process-map-region-frame kind-${esc(region.kind)}"
    style="left:${region.bounds.x}px;top:${region.bounds.y}px;width:${region.bounds.width}px;height:${region.bounds.height}px"></div>`;
}

function renderProcessMapRegionDetail(region, layout) {
  const groups = region.arms?.length
    ? region.arms
    : region.tasks?.length
      ? region.tasks
      : region.nodeIds?.length
        ? [{ label: region.kind === "exception" ? "Вызовы только при обработке ошибки" : "Затронутые вызовы", nodeIds: region.nodeIds }]
        : [];
  const sourceName = region.sourceRef || region.filePath || "";
  const taskSourceLine = groups
    .map((group) => String(group.taskId || "").match(/:(\d+)$/)?.[1])
    .find(Boolean);
  const sourceLine = region.sourceLine || taskSourceLine;
  const sourceLocation = sourceName
    ? `${sourceName}${sourceLine ? `:${fmt(sourceLine)}` : ""}`
    : (sourceLine ? `строка ${fmt(sourceLine)} в методе-владельце` : "—");
  const groupRows = groups.map((group, index) => {
    const nodeIds = group.nodeIds || [];
    const calls = uniq(nodeIds.map((nodeId) => {
      for (const call of layout.calls) {
        if ((call.processIr?.nodeIds || []).includes(nodeId)) return call.id;
      }
      return "";
    })).map((callId) => layout.callById.get(callId)).filter(Boolean);
    return `<li><b>${esc(group.label || group.taskId || `Ветка ${index + 1}`)}</b><span>${calls.map((call) => esc(`${call.sourceLabel} → ${call.targetLabel}`)).join("; ") || "вызовы скрыты текущим фильтром"}</span></li>`;
  }).join("");
  $("sequence-detail").innerHTML = `
    <span class="detail-kicker">УПРАВЛЕНИЕ ПОТОКОМ</span>
    <h3>${esc(region.label)}</h3>
    <p>${region.kind === "choice"
      ? "Ромб показывает взаимоисключающие ветки условия. Он не является отдельным сервисом или вызовом."
      : region.kind === "parallel"
        ? "Этот блок запускает несколько веток параллельно. Порядок их завершения не утверждается."
        : region.kind === "async_task"
          ? "Вызовы выполняются внутри отдельной асинхронной задачи; это не синхронное продолжение вызывающего потока."
          : region.kind === "exception"
            ? "Это обработка исключения или аварийная ветка исходного кода."
            : "Этот участок кода может повторять вложенные действия."}</p>
    <div class="kv">
      <span>Условие</span><b>${esc(processMapValue(region.condition || region.guard))}</b>
      <span>Смысл области</span><b>${esc(region.scopeLabel || "управление потоком")}</b>
      <span>Метод-владелец</span><b>${esc(processMapValue(region.ownerMethodId || region.ownerMethod || region.methodId))}</b>
      <span>Файл / строка</span><b>${esc(sourceLocation)}</b>
      <span>Объединение веток</span><b>${region.joinProven === true ? "доказано" : region.joinProven === false ? "не доказано" : "не применимо"}</b>
    </div>
    <div class="detail-section"><h3>Ветки и задачи</h3><ul class="process-map-branch-list">${groupRows || "<li>Состав региона взят из AST, но отдельные ветки не названы.</li>"}</ul></div>
    <p class="muted">Источник этого шлюза — управляющая структура AST. ИИ-текст не используется для определения самой развилки.</p>`;
}

function renderProcessMapRelationDetail(relation, layout) {
  const from = layout.callById.get(relation.fromCallId);
  const to = layout.callById.get(relation.toCallId);
  const registryContext = relation.kind === "registry_context";
  $("sequence-detail").innerHTML = `
    <span class="detail-kicker">СВЯЗЬ БЛОКОВ</span>
    <h3>${esc(from?.targetLabel || from?.sourceLabel)} → ${esc(to?.targetLabel || to?.sourceLabel)}</h3>
    <p><b>${esc(relation.label)}.</b> ${registryContext
      ? "Пунктир присоединяет ожидаемую бизнес-границу из Excel к ближайшей доказанной точке кода. Это не утверждение, что код внешней системы загружен или что Excel доказал порядок выполнения."
      : relation.kind === "async_handoff"
      ? "Следующий блок получает управление асинхронно; линия поэтому пунктирная."
      : relation.kind === "synchronous_continuation"
        ? "Следующий блок достигается после синхронного возврата или в том же доказанном пути исполнения."
        : relation.kind === "causal_continuation"
          ? "Доказано, что результат или управление предыдущего действия нужен следующему."
          : "AST и путь вызовов подтверждают отношение «раньше → позже», но линия не равна времени production-трассы."}</p>
    <div class="kv">
      <span>Откуда</span><b>${esc(from ? `${from.sourceLabel} → ${from.targetLabel}` : relation.fromCallId)}</b>
      <span>Куда</span><b>${esc(to ? `${to.sourceLabel} → ${to.targetLabel}` : relation.toCallId)}</b>
      <span>Тип</span><b>${esc(relation.kind || "ordered_before")}</b>
      <span>Основание</span><b>${esc(processMapValue(relation.reason || relation.evidence || relation.sourceRef))}</b>
    </div>
    <p class="muted">${registryContext
      ? "Нажмите на пунктирный прямоугольник, чтобы увидеть строки архитектурного реестра и найденную кодовую границу."
      : "Нажмите на прямоугольник, чтобы открыть транспорт, DTO, поля, ответ и ссылки на Excel-маппинг."}</p>`;
}

function renderProcessRegistryBoundaryDetail(call) {
  const boundary = call.registryBoundary || {};
  const refs = (boundary.sourceRefs || []).map((ref) => `
    <li><b>${esc(ref.sheet || "лист")}, строка ${fmt(ref.row || "—")}</b><span>${esc(ref.file || "")}</span></li>`).join("");
  const names = (boundary.businessNames || []).map((value) => `<li>${esc(value)}</li>`).join("");
  const points = (boundary.businessPoints || []).map((value) => `<span>${esc(value)}</span>`).join("");
  const codeBacked = boundary.evidenceStatus === "code_boundary_and_registry";
  $("sequence-detail").innerHTML = `
    <span class="detail-kicker">АРХИТЕКТУРНАЯ ГРАНИЦА</span>
    <h3>${esc(call.sourceLabel)} → ${esc(call.targetLabel)}</h3>
    <p>${codeBacked
      ? "Анализатор нашёл исходящий вызов в коде, но код ресивера не загружен. Архитектурный Excel называет внешний компонент и бизнес-взаимодействие, поэтому граница показана в процессе без выдуманного внутреннего продолжения."
      : "Архитектурный Excel описывает ожидаемый вход в этот процесс. Загруженный корпус подтверждает саму точку входа сервиса, но код внешнего отправителя отсутствует."}</p>
    <div class="kv">
      <span>Статус</span><b>${codeBacked ? "граница в коде + строка Excel" : "точка входа процесса + строка Excel"}</b>
      <span>Направление</span><b>${boundary.direction === "inbound" ? "вход из внешнего контура" : "выход во внешний контур"}</b>
      <span>Внешний компонент</span><b>${esc(boundary.externalComponent || "не назван")}</b>
      <span>Внешняя система</span><b>${esc(boundary.externalSystem || "не названа")}</b>
      <span>Внутренний сервис</span><b>${esc(boundary.internalService || "—")}</b>
      <span>Транспорт</span><b>${esc(transportLabel(boundary.transport || "architecture_registry"))}</b>
      <span>Адрес / канал</span><b>${esc(boundary.transportAddress || "не разрешён")}</b>
      <span>Кодовая граница</span><b>${esc(boundary.sourceExitId || "для входа не применимо")}</b>
      <span>Код</span><b>${esc(boundary.sourceFile ? `${boundary.sourceFile}${boundary.sourceLine ? `:${boundary.sourceLine}` : ""}` : "код внешней стороны не загружен")}</b>
      <span>Порядок</span><b>${codeBacked ? "привязан к исходящему маршруту в коде" : "до первого шага; задан направлением Excel"}</b>
    </div>
    <div class="detail-section"><h3>Как взаимодействие называется в Excel</h3><ul class="process-map-branch-list">${names || "<li>Название не заполнено.</li>"}</ul></div>
    <div class="detail-section"><h3>Точки взаимодействия</h3><div class="chips">${points || "<span>не заполнены</span>"}</div></div>
    <div class="detail-section"><h3>Ссылки на архитектурный реестр</h3><ul class="process-map-branch-list">${refs || "<li>Ссылка на строку не сохранена.</li>"}</ul></div>
    <p class="muted">Excel подтверждает ожидаемый бизнес-контур и владельцев границы, но сам по себе не доказывает порядок внутренних вызовов. Порядок зелёных блоков по-прежнему строится только по коду.</p>`;
}

function processMapStageFacts(stage, layout) {
  const calls = (stage.callIds || []).map((callId) => layout.callById.get(callId)).filter(Boolean);
  const services = uniq(calls.flatMap((call) => [call.sourceLabel, call.targetLabel]));
  const payloads = uniq(calls.map((call) => call.payload).filter((value) => value && value !== "none"));
  const purposes = uniq(calls
    .filter((call) => call.order?.purpose && call.order?.purposeSource !== "deterministic")
    .map((call) => call.order.purpose));
  const aiPurposeCount = calls.filter((call) => (
    call.order?.purpose && call.order?.purposeSource !== "deterministic"
  )).length;
  const scores = calls
    .map((call) => Number(call.order?.readiness?.score))
    .filter(Number.isFinite);
  const memberIds = new Set(calls.map((call) => call.id));
  const regions = layout.regions.filter((region) => (
    (region.memberCallIds || []).some((callId) => memberIds.has(callId))
  ));
  return {
    calls,
    services,
    payloads,
    purposes,
    aiPurposeCount,
    regions,
    fieldCount: calls.reduce((sum, call) => sum + Number(call.fieldCount || 0), 0),
    synchronousCount: calls.filter((call) => (
      call.responseSemantics?.isSynchronous || call.responseSemantics?.kind === "reverse_contract"
    )).length,
    readiness: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
  };
}

function renderProcessMapStageDetail(stage, layout, process) {
  const facts = processMapStageFacts(stage, layout);
  const registryStage = stage.isRegistryBoundary === true;
  const rawStepCount = (process?.steps || []).filter((step) => (
    Number(step.stage ?? 1) === Number(stage.stage)
  )).length;
  const collapsedStepCount = Math.max(0, rawStepCount - facts.calls.length);
  const sourceServices = uniq(facts.calls.map((call) => call.sourceLabel));
  const targetServices = uniq(facts.calls.map((call) => call.targetLabel));
  const actionSummary = registryStage
    ? `${stage.label} связывает загруженный код с участниками, указанными в архитектурном Excel; границ на карте: ${fmt(facts.calls.length)}.`
    : sourceServices.length === 1
    ? `${sourceServices[0]} выполняет действия к сервисам ${targetServices.join(", ")}; на карте показано ${fmt(facts.calls.length)} уникальных блоков.`
    : `Этап связывает сервисы ${facts.services.join(", ")}; на карте показано ${fmt(facts.calls.length)} уникальных блоков.`;
  const responseSummary = registryStage
    ? "Эти границы показывают бизнес-контур процесса. Наличие ответа и его поля считаются доказанными только когда они подтверждены загруженным кодом."
    : facts.synchronousCount
    ? `Синхронный ответ доказан для ${fmt(facts.synchronousCount)} из ${fmt(facts.calls.length)} показанных блоков и может использоваться дальше вызывающим кодом.`
    : "Синхронный возврат на этом этапе не доказан.";
  const controlSummary = registryStage
    ? "Колонка не подменяет внутренний порядок исполнения: Excel задаёт участника и направление, а привязка к процессу отдельно проверяется по точке входа или исходящему вызову в коде."
    : facts.regions.length
    ? `Управление ограничено конструкциями: ${facts.regions.map((region) => region.label.toLowerCase()).join(", ")}.`
    : "Отдельная развилка или асинхронная задача для этапа не выделена.";
  const purposeRows = facts.purposes.map((purpose) => `<li>${esc(purpose)}</li>`).join("");
  const regionRows = facts.regions.map((region) => `<span>${esc(region.label)}</span>`).join("");
  const callRows = facts.calls.map((call) => `
    <button type="button" class="process-map-stage-call" data-stage-call-id="${esc(call.id)}">
      <b>${registryStage ? (call.registryBoundary?.direction === "inbound" ? "Вход" : "Внешний выход") : `Шаг ${fmt(call.displayStep || call.order?.step)}`}</b>
      <span>${esc(call.sourceLabel)} → ${esc(call.targetLabel)}</span>
      <small>${esc(call.payload || "модель не определена")}</small>
    </button>`).join("");
  const purposeSource = registryStage
    ? "Названия и назначение взяты из архитектурного Excel; техническая привязка показана отдельно в карточке каждой границы."
    : facts.aiPurposeCount
    ? `${fmt(facts.aiPurposeCount)} сохранённых ИИ-объяснений; остальные формулировки взяты из доказанного порядка и причин попадания в процесс.`
    : "Назначение обобщено детерминированно по действиям и доказанным переходам этапа.";
  $("sequence-detail").innerHTML = `
    <span class="detail-kicker">${registryStage ? "АРХИТЕКТУРНЫЙ КОНТУР" : "ЭТАП ПРОЦЕССА"}</span>
    <h3>${esc(registryStage ? stage.label : `Этап ${fmt(stage.stage)}`)}</h3>
    <p>${esc(`${actionSummary} ${responseSummary} ${controlSummary}`)}</p>
    <div class="kv">
      <span>Показанных блоков</span><b>${fmt(facts.calls.length)}</b>
      <span>${registryStage ? "Границ из Excel" : "Исходных шагов"}</span><b>${fmt(registryStage ? facts.calls.length : (rawStepCount || facts.calls.length))}${!registryStage && collapsedStepCount ? ` · ${fmt(collapsedStepCount)} вариантов схлопнуто` : ""}</b>
      <span>Сервисов</span><b>${fmt(facts.services.length)} · ${esc(facts.services.join(", ") || "—")}</b>
      <span>Моделей</span><b>${esc(facts.payloads.join(", ") || "не определены")}</b>
      <span>Связей полей</span><b>${fmt(facts.fieldCount)}</b>
      <span>Синхронных ответов</span><b>${fmt(facts.synchronousCount)}</b>
      <span>Средняя готовность</span><b>${facts.readiness == null ? "—" : `${fmt(Math.round(facts.readiness * 10) / 10)}/100`}</b>
    </div>
    <div class="detail-section">
      <h3>${registryStage ? "Зачем нужна эта граница" : "Зачем нужен этап"}</h3>
      ${purposeRows ? `<ul class="process-map-stage-purpose">${purposeRows}</ul>` : `<p class="muted">Сохранённого ИИ-объяснения этапа пока нет. Доступное выше описание построено из действий и управляющих конструкций без домысливания бизнес-смысла.</p>`}
      <p class="muted">${esc(purposeSource)}</p>
      <button type="button" class="mini-btn wide" id="stage-ask-agent">Уточнить у AI по этому этапу</button>
    </div>
    ${regionRows ? `<div class="detail-section"><h3>Управление потоком</h3><div class="process-map-stage-regions">${regionRows}</div></div>` : ""}
    <div class="detail-section"><h3>${registryStage ? "Границы контура" : "Действия этапа"}</h3><div class="process-map-stage-calls">${callRows}</div></div>`;
  $("sequence-detail").querySelectorAll("[data-stage-call-id]").forEach((button) => {
    button.onclick = () => {
      state.sequence.selectedStage = null;
      state.sequence.selectedId = button.dataset.stageCallId || "";
      const call = layout.callById.get(state.sequence.selectedId);
      const params = new URLSearchParams(window.location.search);
      params.delete("mapStage");
      if (call?.order?.step) params.set("step", call.order.step);
      window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
      renderSequenceView();
    };
  });
  $("stage-ask-agent")?.addEventListener("click", () => {
    setInspectorTab("agent");
    const input = $("agent-question");
    if (input) {
      input.value = registryStage
        ? `Что означает ${stage.label.toLowerCase()}, как каждая граница связана с кодом и какими строками архитектурного Excel это подтверждено?`
        : `Зачем нужен этап ${stage.stage}, что в нём происходит и какими фактами это подтверждено?`;
      input.focus();
    }
    updateAgentContext();
  });
}

function renderProcessMapDetail(layout, process) {
  const stage = state.sequence.selectedStage == null
    ? null
    : layout.stages.find((item) => Number(item.stage) === Number(state.sequence.selectedStage));
  if (stage) {
    renderProcessMapStageDetail(stage, layout, process);
    return;
  }
  const region = layout.regions.find((item) => item.id === state.sequence.selectedRegionId);
  if (region) {
    renderProcessMapRegionDetail(region, layout);
    return;
  }
  const relation = layout.relations.find((item) => item.id === state.sequence.selectedRelationId);
  if (relation) {
    renderProcessMapRelationDetail(relation, layout);
    return;
  }
  const call = layout.callById.get(state.sequence.selectedId);
  if (call?.isRegistryBoundary) {
    renderProcessRegistryBoundaryDetail(call);
    return;
  }
  renderSequenceDetail();
}

function renderProcessMapView(activeProcess, sequenceData) {
  if (!activeProcess) {
    state.sequence.processMapData = null;
    renderProcessMapChooser();
    return;
  }
  const layout = window.AIProfilerProcessMap?.build(activeProcess, sequenceData.calls);
  state.sequence.processMapData = layout;
  if (!layout?.calls?.length) {
    $("sequence-canvas").innerHTML = `<div class="empty">После текущих фильтров в процессе не осталось блоков. Отключите «только уверенные» или очистите фильтр.</div>`;
    $("sequence-detail").innerHTML = `<div class="empty">Карта не дорисовывает скрытые или неподтверждённые вызовы.</div>`;
    return;
  }
  if (!layout.stages.some((stage) => Number(stage.stage) === Number(state.sequence.selectedStage))) {
    state.sequence.selectedStage = null;
  }
  if (state.sequence.selectedStage) {
    state.sequence.selectedId = "";
  } else if (!state.sequence.selectedId || !layout.callById.has(state.sequence.selectedId)) {
    state.sequence.selectedId = layout.calls[0].id;
  }
  updateAgentContext();
  const zoom = state.sequence.zoom;
  const edgeSvg = layout.relations.map((relation) => {
    const from = layout.callById.get(relation.fromCallId);
    const to = layout.callById.get(relation.toCallId);
    if (!from || !to) return "";
    const path = window.AIProfilerProcessMap.edgePath(from, to);
    const selected = relation.id === state.sequence.selectedRelationId ? "selected" : "";
    return `<g class="process-map-relation ${esc(relation.cssClass)} ${selected}">
      <path class="process-map-edge" d="${path}" marker-end="url(#process-arrow)" />
      <path class="process-map-edge-hit" data-relation-id="${esc(relation.id)}" d="${path}"><title>${esc(relation.label)}</title></path>
    </g>`;
  }).join("");
  const controlSvg = layout.regions.flatMap((region) => region.links.map((link) => {
    const target = layout.callById.get(link.targetCallId);
    if (!target) return "";
    return `<path class="process-map-control-link kind-${esc(region.kind)}" d="${window.AIProfilerProcessMap.controlPath(region, target)}"><title>${esc(region.label)} · ${esc(link.label)}</title></path>`;
  })).join("");
  const startEdges = layout.start.targetCallIds.map((callId) => {
    const call = layout.callById.get(callId);
    return call ? `<path class="process-map-edge" d="M ${layout.start.x + 16} ${layout.start.y} H ${call.processMap.x}" marker-end="url(#process-arrow)" />` : "";
  }).join("");
  const endPoints = layout.end.points || layout.end.sourceCallIds.map((callId) => ({
    sourceCallId: callId,
    x: layout.end.x,
    y: layout.end.y,
    kind: "end",
    label: "Конец",
  }));
  const endEdges = endPoints.map((point) => {
    const call = layout.callById.get(point.sourceCallId);
    const external = point.kind === "external_boundary" ? "external" : "";
    return call ? `<path class="process-map-edge process-map-terminal-edge ${external}" d="M ${call.processMap.x + call.processMap.width} ${call.processMap.y + call.processMap.height / 2} H ${point.x - 16}" marker-end="url(#process-arrow)" />` : "";
  }).join("");
  $("sequence-canvas").innerHTML = `
    <div class="process-map-notice ${layout.runtimeTraceSafe ? "trace-safe" : "path-union"}">
      <b>${layout.runtimeTraceSafe ? "Карта ограничений исполнения" : "Карта возможных путей"}</b>
      <span>${layout.runtimeTraceSafe
        ? "Линии показывают доказанные зависимости; параллельные ветки не сортируются по времени завершения."
        : "Схема объединяет альтернативные статические маршруты и не выдаёт их за один production-запуск."}</span>
      ${layout.unsequencedCount ? `<em>${fmt(layout.unsequencedCount)} блоков без доказанной позиции</em>` : ""}
    </div>
    <div class="process-map-legend">
      <span><i class="legend-task"></i> действие сервиса</span>
      <span><i class="legend-gateway"></i> условие / параллельность</span>
      <span><i class="legend-async-region"></i> отдельный поток</span>
      <span><i class="legend-error-region"></i> только при ошибке</span>
      <span title="Линию можно выбрать и открыть её основание"><i class="legend-flow"></i> доказанный переход · линия кликабельна</span>
      <span><i class="legend-async"></i> асинхронная передача</span>
      <span><i class="legend-registry"></i> граница из Excel</span>
      <span title="ИИ-текст показывается только когда у него есть сохранённые основания; иначе карточка объясняет детерминированную причину попадания шага в процесс">Зачем (ИИ) / Почему здесь</span>
    </div>
    <div class="process-map-stage" style="width:${layout.width * zoom}px;height:${layout.height * zoom}px">
      <div class="process-map-world" style="width:${layout.width}px;height:${layout.height}px;transform:scale(${zoom})">
        ${layout.stages.map((stage) => `<div class="process-map-stage-band" style="left:${stage.x}px;width:${stage.width}px"></div>`).join("")}
        ${layout.stages.map((stage) => `<button type="button" class="process-map-stage-header ${stage.isRegistryBoundary ? "registry-boundary" : ""} ${Number(stage.stage) === Number(state.sequence.selectedStage) ? "selected" : ""}" data-map-stage="${fmt(stage.stage)}" style="left:${stage.x + 8}px;width:${Math.max(150, stage.width - 16)}px" title="Открыть описание ${esc(stage.label || `этапа ${stage.stage}`)}"><b>${esc(stage.label || `Этап ${stage.stage}`)}</b><span>${fmt(stage.callCount)} блоков</span></button>`).join("")}
        ${layout.regions.map(processMapRegionFrameHtml).join("")}
        <svg class="process-map-svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" aria-label="Связи карты процесса">
          <defs><marker id="process-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" /></marker></defs>
          ${startEdges}${edgeSvg}${endEdges}${controlSvg}
        </svg>
        <div class="process-map-event start" style="left:${layout.start.x - 16}px;top:${layout.start.y - 16}px" title="Точка входа процесса"><span>Старт</span></div>
        ${endPoints.map((point) => `<div class="process-map-event ${point.kind === "external_boundary" ? "external-boundary" : "end"}" style="left:${point.x - 16}px;top:${point.y - 16}px" title="${point.kind === "external_boundary" ? "Продолжение уходит за границу загруженного кода" : "Наблюдаемый конец этой ветки"}"><span>${esc(point.label)}</span></div>`).join("")}
        ${layout.calls.map(processMapNodeHtml).join("")}
        ${layout.regions.map(processMapGatewayHtml).join("")}
      </div>
    </div>`;
  bindSequenceCanvasInteractions();
  renderProcessMapDetail(layout, activeProcess);
}

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
  ].join(" · ")
    + (activeProcess?.processIr ? `
      <div class="process-ir-summary ${activeProcess.processIr.runtimeTraceSafe ? "trace-safe" : "path-union"}">
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
      </div>` : "")
    + (activeProcess?.narrative ? `
      <div class="process-narrative">
        <b>${activeProcess.narrativeSource === "curated_registry" ? "Курируемое объяснение по коду и реестру ИВ:" : "Объяснение ИИ по фактам кода:"}</b> ${esc(processNarrativeSummary(activeProcess.narrative))}
        <span class="muted">Оснований: ${fmt(activeProcess.narrativeCitations?.length || 0)}.</span>
        ${activeProcess.narrativeGaps?.length ? `<details class="ai-evidence">
          <summary>Незакрытые выходы: ${fmt(activeProcess.narrativeGaps.length)}</summary>
          <ul>${activeProcess.narrativeGaps.map((gap) => `<li>${esc(gap)}</li>`).join("")}</ul>
        </details>` : ""}
      </div>` : "");
  const gapResearch = activeProcess?.unresolvedBoundaryResearch || [];
  if (gapResearch.length) {
    $("sequence-summary").insertAdjacentHTML("beforeend", `
      <div class="process-narrative">
        <b>Что ИИ проверил в исходном коде:</b>
        ${fmt(gapResearch.filter((item) => item.codeEvidenceVerified).length)} из ${fmt(gapResearch.length)} незакрытых физических выходов.
        <details class="ai-evidence">
          <summary>Показать результаты чтения кода</summary>
          <ul>${gapResearch.map((item) => `
            <li>
              <b>${esc(processResearchClassificationLabel(item.classification))}.</b>
              ${esc(item.summary || "Кода недостаточно для содержательного объяснения.")}
              ${item.candidateTarget?.serviceId ? ` Возможный получатель: <b>${esc(sequenceServiceName(item.candidateTarget.serviceId))}</b>, связь пока не доказана.` : ""}
              ${(item.missingEvidence || []).length ? `<span class="muted"> Не хватает: ${esc(item.missingEvidence.join("; "))}</span>` : ""}
            </li>
          `).join("")}</ul>
        </details>
      </div>
    `);
  }
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
  const call = data?.calls.find((item) => item.id === state.sequence.selectedId);
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
  const orderBlock = order ? `
    <div class="detail-section">
      <h3>Порядок вызова</h3>
      ${stepReadiness ? `<p><span class="badge proof-proven">Готовность шага ${fmt(stepReadiness.score)}/100 · ${esc(readinessStatusLabel(stepReadiness.status))}</span>${stepReadiness.integrationScope === "cross_source_group" ? ` <span class="badge">межФП</span>` : ""}</p>` : ""}
      <div class="kv">
        <span>Процесс</span><b>${esc(order.processName || order.processId || "—")}</b>
        <span>Показанный шаг</span><b>${fmt(call.step)} (этап ${fmt(order.stage)})</b>
        <span>Исходный шаг</span><b>${fmt(order.step)}</b>
        <span>Входных путей</span><b>${fmt(call.variantCount || 1)}${call.variantCount > 1 ? " — один вызов, не повторы подряд" : ""}</b>
        <span>После</span><span class="mono">${esc(order.afterEdgeId || "— (старт процесса)")}</span>
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
            ? `Есть ${fmt(order.processIr.causalRelations.length)} доказанная причинная зависимость.`
            : "Это входной шаг или начало независимой ветки."}</span>
        ${(order.processIr.regionKinds || []).includes("choice") || (order.processIr.regionKinds || []).includes("guard")
          ? `<span>Условие выполнения: ${esc(processBranchLabel(order.processIr.branchLabels))}.</span>`
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
    if (event.target.closest(".process-map-picker")) return;
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
  canvas.querySelectorAll(".process-map-stage-header").forEach((el) => {
    el.onclick = (event) => {
      event.stopPropagation();
      setInspectorTab("detail");
      const selectedStage = Number(el.dataset.mapStage);
      state.sequence.selectedStage = Number.isFinite(selectedStage) ? selectedStage : null;
      state.sequence.selectedId = "";
      state.sequence.selectedRegionId = "";
      state.sequence.selectedRelationId = "";
      const params = new URLSearchParams(window.location.search);
      if (state.sequence.selectedStage != null) params.set("mapStage", state.sequence.selectedStage);
      else params.delete("mapStage");
      params.delete("step");
      window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
      renderSequenceView();
    };
  });
  canvas.querySelectorAll(".process-map-node").forEach((el) => {
    el.onclick = (event) => {
      event.stopPropagation();
      setInspectorTab("detail");
      state.sequence.selectedId = el.dataset.callId || "";
      state.sequence.selectedStage = null;
      state.sequence.selectedRegionId = "";
      state.sequence.selectedRelationId = "";
      const selectedCall = state.sequence.processMapData?.callById?.get(state.sequence.selectedId);
      const params = new URLSearchParams(window.location.search);
      params.delete("mapStage");
      if (selectedCall?.order?.step) params.set("step", selectedCall.order.step);
      else params.delete("step");
      window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
      renderSequenceView();
    };
  });
  canvas.querySelectorAll(".process-map-gateway").forEach((el) => {
    el.onclick = (event) => {
      event.stopPropagation();
      setInspectorTab("detail");
      state.sequence.selectedStage = null;
      state.sequence.selectedRegionId = el.dataset.regionId || "";
      state.sequence.selectedRelationId = "";
      const params = new URLSearchParams(window.location.search);
      params.delete("mapStage");
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
      params.delete("mapStage");
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

function fitSequence() {
  const canvas = $("sequence-canvas");
  if (state.sequence.diagramMode === "process") {
    const layout = state.sequence.processMapData;
    if (!canvas || !layout?.width) return;
    const horizontal = (canvas.clientWidth - 28) / layout.width;
    const vertical = (canvas.clientHeight - 96) / layout.height;
    setSequenceZoom(Math.min(horizontal, vertical, 1.2));
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
    runtimeTraceSafe: layout.runtimeTraceSafe,
    unsequencedCount: layout.unsequencedCount,
    stages: layout.stages,
    start: layout.start,
    end: layout.end,
    calls: layout.calls,
    relations: layout.relations.map((relation) => {
      const from = layout.callById.get(relation.fromCallId);
      const to = layout.callById.get(relation.toCallId);
      return { ...relation, path: from && to ? window.AIProfilerProcessMap.edgePath(from, to) : "" };
    }),
    regions: layout.regions,
    controlPaths: layout.regions.flatMap((region) => region.links.map((link) => {
      const target = layout.callById.get(link.targetCallId);
      return target ? { regionId: region.id, kind: region.kind, targetCallId: link.targetCallId, label: link.label, path: window.AIProfilerProcessMap.controlPath(region, target) } : null;
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
  const layout = window.AIProfilerProcessMap?.build(process, data.calls);
  if (!layout?.calls?.length) {
    showError(new Error("В карте нет блоков под текущим фильтром."));
    return;
  }
  let report = buildProcessMapExportReport(process, layout);
  if (kind === "package") report = prepareExportAssetLinks(report);
  const safeName = String(process.name || process.processId || "process")
    .replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]+/g, "_");
  const base = `process_map_${state.snapshot?.name || "snapshot"}_${safeName}`;
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
      <section class="brief-section"><h3>Термины человеческим языком</h3><div class="brief-defs">${(data.definitions || []).map((item) => `<details><summary>${esc(item.term)}</summary><p>${esc(item.meaning)}</p></details>`).join("")}</div></section>
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
  state.sequence.selectedRegionId = "";
  state.sequence.selectedRelationId = "";
  const select = $("sequence-scope");
  if (select) select.value = state.sequence.scope;
  const params = new URLSearchParams(window.location.search);
  params.set("scope", state.sequence.scope);
  params.delete("process");
  params.delete("step");
  params.delete("mapStage");
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
  state.sequence.selectedId = "";
  state.sequence.selectedStage = null;
  state.sequence.selectedRegionId = "";
  state.sequence.selectedRelationId = "";
  window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  setView("sequence");
  if (state.sequence.diagramMode === "process") requestAnimationFrame(fitSequence);
}

function clearProcessFocus() {
  state.sequence.processId = "";
  state.sequence.processMembers = null;
  state.sequence.selectedId = "";
  state.sequence.selectedStage = null;
  state.sequence.selectedRegionId = "";
  state.sequence.selectedRelationId = "";
  const params = new URLSearchParams(window.location.search);
  params.delete("process");
  params.delete("step");
  params.delete("mapStage");
  window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  renderSequenceView();
}

function buildMappingRows() {
  const graph = state.graph || {};
  const linksByContract = new Map();
  for (const link of graph.contractFieldLinks || []) {
    const id = String(link.contractId || "");
    linksByContract.set(id, [...(linksByContract.get(id) || []), link]);
  }
  const query = state.mappings.filter.trim().toLowerCase();
  const rows = (graph.contracts || []).map((contract) => {
    const links = linksByContract.get(contract.contractId) || [];
    const confirmedLinks = links.filter((link) => link.confirmed === true);
    const mapping = contractMapping(contract);
    const requestSource = (mapping.requestSourcePayloadTypes || []).join(", ");
    const requestTarget = (mapping.requestTargetPayloadTypes || []).join(", ");
    const payload = (contract.sharedPayloadTypes || []).join(", ") ||
      ([requestSource, requestTarget].filter(Boolean).join(" → "));
    const xlsx = mapping.href || "";
    const csv = mapping.csvHref || "";
    const strict = contract.confirmed === true || strictLegacyContract(contract);
    return {
      id: contract.contractId,
      contract,
      links,
      confirmedLinks,
      strict,
      sourceLabel: sequenceServiceName(contract.sourceService),
      targetLabel: sequenceServiceName(contract.targetService),
      payload,
      xlsx,
      csv,
      searchText: [
        contract.contractId,
        contract.sourceService,
        contract.targetService,
        payload,
        contract.proofLevel,
        contract.contractLevel,
        contract.transport,
        ...(contract.fieldNames || []),
        ...(contract.fieldPaths || []),
      ].join(" ").toLowerCase(),
    };
  });
  return rows
    .filter((row) => !state.mappings.confidentOnly || row.strict)
    .filter((row) => !query || row.searchText.includes(query))
    .sort((a, b) =>
      Number(b.strict) - Number(a.strict) ||
      b.confirmedLinks.length - a.confirmedLinks.length ||
      a.sourceLabel.localeCompare(b.sourceLabel)
    );
}

function renderMappingsView() {
  if (!state.graph) return;
  const rows = buildMappingRows();
  const allContracts = state.graph.contracts || [];
  const allLinks = state.graph.contractFieldLinks || [];
  const strictContracts = allContracts.filter((contract) => contract.confirmed === true || strictLegacyContract(contract));
  const mappedContracts = allContracts.filter((contract) => Boolean(contractMapping(contract).href));
  const completeMappings = mappedContracts.filter((contract) => contractMapping(contract).status === "complete");
  const responseMappings = mappedContracts.filter((contract) => (contractMapping(contract).directions || []).includes("response"));
  const confirmedLinks = allLinks.filter((link) => link.confirmed === true);
  $("mapping-summary").textContent = [
    `${fmt(rows.length)} показано`,
    `${fmt(mappedContracts.length)}/${fmt(allContracts.length)} имеют Excel · ${fmt(completeMappings.length)} пополевые полные`,
    `${fmt(responseMappings.length)} содержат доказанный ответ`,
    `${fmt(strictContracts.length)} уверенных`,
    `${fmt(confirmedLinks.length)}/${fmt(allLinks.length)} пополевых путей подтверждено`,
  ].join(" · ");

  if (!state.mappings.selectedId || !rows.some((row) => row.id === state.mappings.selectedId)) {
    state.mappings.selectedId = rows[0]?.id || "";
  }
  $("mapping-table").innerHTML = `
    <thead>
      <tr>
        <th>Маршрут</th>
        <th>Excel-маппинг</th>
        <th>Поля</th>
        <th>Доказательство</th>
        <th>Качество</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((row) => renderMappingRow(row)).join("") || `<tr><td colspan="5" class="empty">Маппинги не найдены под текущий фильтр.</td></tr>`}
    </tbody>
  `;
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

function renderMappingRow(row) {
  const contract = row.contract;
  const selected = row.id === state.mappings.selectedId ? "selected" : "";
  const mapping = contractMapping(contract);
  const claimStatus = contract.evidenceClaim?.status || "";
  return `
    <tr class="${selected}" data-mapping-id="${esc(row.id)}">
      <td>
        <b>${esc(row.sourceLabel)} → ${esc(row.targetLabel)}</b>
        <div class="mono">${esc(contract.transport || "")}</div>
      </td>
      <td>
        ${esc(row.payload || "payload не раскрыт")}
        <div class="muted">${esc(mappingCoverageLabel(mapping))}</div>
      </td>
      <td>${fmt(contract.sharedFieldCount)} общих · ${fmt(row.confirmedLinks.length)} путей подтверждено</td>
      <td>${esc(contractProofLabel(contract.proofLevel))}<div class="muted">${row.strict ? "уверенный" : "требует проверки"}${claimStatus ? ` · ${esc(claimStatusLabel(claimStatus))}` : ""}</div></td>
      <td>${esc(qualityTierLabel(contract.qualityTier || contract.proofLevel || contract.status))}<div class="muted">${fmt(contract.targetSourceRefCount)} мест в коде</div></td>
    </tr>
  `;
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
  const sourceFields = (contract.sourceContractFields || []).slice(0, 80).map((field) => `<span class="field-chip">${esc(field)}</span>`).join("");
  const targetFields = (contract.targetContractFields || []).slice(0, 80).map((field) => `<span class="field-chip">${esc(field)}</span>`).join("");
  const linkRows = row.links.slice(0, 160).map((link) => `
    <tr>
      <td><b>${esc(link.field || "")}</b><div class="muted">${link.confirmed ? "подтверждено" : "требует проверки"}</div></td>
      <td class="mono">${esc((link.sourcePaths || []).join(", "))}</td>
      <td class="mono">${esc((link.targetPaths || []).join(", "))}</td>
      <td>${esc(contractProofLabel(link.proofLevel))}</td>
    </tr>
  `).join("");
  const preview = renderCsvPreview(row);
  $("mapping-detail").innerHTML = `
    <h3>${esc(row.sourceLabel)} → ${esc(row.targetLabel)}</h3>
    <p class="muted">${esc(contract.proofLevel || "")} · ${esc(contract.transport || "")}</p>
    <div class="kv">
      <span>Payload</span><b>${esc(row.payload || "—")}</b>
      <span>Полнота Excel</span><b>${esc(mappingCoverageLabel(contractMapping(contract)))}</b>
      <span>Направления в Excel</span><b>${esc(mappingDirectionsLabel(contractMapping(contract)))}</b>
      <span>Связь подтверждена</span><b>${row.strict ? "да" : "нет"}</b>
      <span>Итог проверки</span><b>${esc(claimStatusLabel(contract.evidenceClaim?.status))}</b>
      <span>Пополевые пути</span><b>${fmt(row.confirmedLinks.length)} / ${fmt(row.links.length)} подтверждено</b>
      <span>Уровень доказательства</span><b>${esc(qualityTierLabel(contract.qualityTier || contract.proofLevel || contract.status))}</b>
      <span>Технический ID</span><span class="mono">${esc(contract.contractId)}</span>
    </div>
    <div class="mapping-actions">
      ${row.xlsx ? `<a class="mini-btn" href="${fileUrl(row.xlsx)}" target="_blank" rel="noreferrer">Открыть XLSX</a>` : ""}
      ${row.csv ? `<button class="mini-btn" type="button" id="mapping-load-csv">Показать CSV</button>` : ""}
    </div>
    <div class="detail-section">
      <h3>Поля модели отправителя</h3>
      <div class="field-list">${sourceFields || `<span class="muted">Не раскрыты.</span>`}</div>
    </div>
    <div class="detail-section">
      <h3>Поля модели получателя</h3>
      <div class="field-list">${targetFields || `<span class="muted">Не раскрыты.</span>`}</div>
    </div>
    <div class="detail-section">
      <h3>Пополевый маппинг</h3>
      <div class="mapping-preview">
        <table class="table">
          <thead><tr><th>Поле</th><th>Путь у отправителя</th><th>Путь у получателя</th><th>Доказательство</th></tr></thead>
          <tbody>${linkRows || `<tr><td colspan="4" class="muted">Пополевые пути не записаны.</td></tr>`}</tbody>
        </table>
      </div>
    </div>
    ${preview}
  `;
  const loadCsv = $("mapping-load-csv");
  if (loadCsv) {
    loadCsv.onclick = async () => {
      await loadMappingCsvPreview(row);
    };
  }
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

function renderCsvPreview(row) {
  if (state.mappings.csvPreviewFor !== row.id) return "";
  const preview = state.mappings.csvPreview;
  if (!preview) return "";
  if (preview.error) {
    return `<div class="detail-section"><h3>CSV preview</h3><p class="muted">${esc(preview.error)}</p></div>`;
  }
  const columns = preview.columns || [];
  const rows = preview.rows || [];
  return `
    <div class="detail-section">
      <h3>CSV preview</h3>
      <p class="muted">${esc(preview.path || row.csv)} · ${fmt(rows.length)} строк загружено</p>
      <div class="mapping-preview">
        <table class="table">
          <thead><tr>${columns.map((column) => `<th>${esc(column)}</th>`).join("")}</tr></thead>
          <tbody>${rows.slice(0, 80).map((item) => `
            <tr>${columns.map((column) => `<td>${esc(item[column] || "")}</td>`).join("")}</tr>
          `).join("")}</tbody>
        </table>
      </div>
    </div>
  `;
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

const TIER_RANK = { confirmed: 0, proven: 1, inferred: 2, candidate: 3 };

function transportLabel(transport) {
  const value = String(transport || "");
  if (value.includes("kafka")) return "сообщение Kafka";
  if (value.includes("jms")) return "сообщение JMS";
  if (value.includes("rabbit")) return "сообщение RabbitMQ";
  if (value.includes("grpc")) return "вызов gRPC";
  if (value.includes("http")) return "синхронный HTTP";
  return transport || "?";
}

function contractProofLabel(value) {
  const labels = {
    exact_contract: "точное совпадение модели и полей",
    strong_contract: "сильное совпадение контракта",
    field_contract: "совпадение по полям",
    schema_alias_field_contract: "схемы связаны по полям и вариантам имени",
    route_inferred: "получатель выведен из маршрута",
    candidate: "возможная связь",
    partial: "частичное доказательство",
  };
  return labels[value] || value || "—";
}

function qualityTierLabel(value) {
  const labels = {
    verified_contract: "проверенная связь с моделью",
    verified_transport: "проверенный адрес или канал",
    candidate: "требует проверки",
    ambiguous: "несколько равных получателей",
  };
  return labels[value] || contractProofLabel(value);
}

function responseProofLabel(value) {
  const labels = {
    synchronous_http_response: "синхронный HTTP-ответ",
    synchronous_query_response: "синхронный ответ",
    reverse_contract: "доказан встречный канал",
    same_payload_rq_rs: "запрос и ответ находятся в одной модели",
    request_event_no_response_proof: "ответ не доказан",
    missing: "ответ не доказан",
  };
  return labels[value] || value || "—";
}

function responseExplanation(call, compatibility) {
  if (call.responseSemantics?.isSynchronous && compatibility?.status === "body_not_consumed") {
    return "Вызов синхронный: клиент дожидается завершения и видит HTTP-статус, но код намеренно отбрасывает тело ответа.";
  }
  if (call.responseSemantics?.isSynchronous && compatibility?.status === "exact") {
    return "Клиент делает синхронный вызов, получатель подтверждён, а модели ответа с обеих сторон совпадают.";
  }
  if (call.responseSemantics?.isSynchronous && compatibility?.status === "serialized_document") {
    const usage = call.responseUsageEvidence || call.contract?.responseUsageEvidence || {};
    return usage.status === "parsed_and_consumed"
      ? "Ответ вернулся как сериализованный документ, затем код клиента его разобрал и передал дальше. Поля wire-модели известны, но использование каждого поля по отдельности пока не доказано."
      : "Ответ вернулся как сериализованный документ. Поля wire-модели известны, но клиентский DTO и использование отдельных полей пока не доказаны.";
  }
  if (call.responseSemantics?.isSynchronous) {
    return "Ответ возвращается вызывающему по тому же синхронному каналу; совместимость модели показана выше.";
  }
  if (call.responseSemantics?.kind === "reverse_contract") {
    return "Возврат подтверждён отдельным встречным каналом.";
  }
  return "Возврат ответа вызывающему для этого перехода не доказан.";
}

function directionLabel(value) {
  const labels = { "rq+rs": "запрос + ответ", request: "запрос", response: "ответ", unknown: "не определено" };
  return labels[value] || value || "—";
}

function claimStatusLabel(value) {
  const labels = { proven: "доказано", partial: "доказано частично", candidate: "требует проверки", ambiguous: "неоднозначно" };
  return labels[value] || value || "—";
}

function readinessStatusLabel(value) {
  const labels = { architecture_ready: "готово для архитектурного просмотра", usable_with_gaps: "можно использовать с оговорками", review_required: "нужна проверка" };
  return labels[value] || value || "—";
}

function orderReasonLabel(value) {
  const match = String(value || "").match(/^AST call path from (.+?) reaches (.+?) at (.+?); transport handoff targets (.+)\.$/);
  if (!match) return value;
  return `Из точки входа ${match[1]} код доходит до исходящего вызова ${match[2]} (${match[3]}), затем данные передаются в ${match[4]}.`;
}

function pathCalls() {
  const calls = buildSequenceData(1, { applyFilters: false }).calls;
  return state.path.confidentOnly ? calls.filter((call) => call.tier === "confirmed") : calls;
}

function findServicePaths(calls, from, to, { maxLen = 10, maxPaths = 40 } = {}) {
  const bySource = new Map();
  for (const call of calls) {
    if (!bySource.has(call.sourceService)) bySource.set(call.sourceService, []);
    bySource.get(call.sourceService).push(call);
  }
  // Обходим сначала сильные рёбра: при лимите путей слабые (candidate) хвосты
  // не должны вытеснять доказанные маршруты из выборки.
  for (const list of bySource.values()) {
    list.sort((a, b) =>
      (TIER_RANK[a.tier] ?? 4) - (TIER_RANK[b.tier] ?? 4) ||
      String(a.targetService || "").localeCompare(String(b.targetService || ""))
    );
  }
  const paths = [];
  const walk = (node, trail, seen) => {
    if (paths.length >= maxPaths || trail.length >= maxLen) return;
    for (const call of bySource.get(node) || []) {
      if (seen.has(call.targetService)) continue;
      const next = [...trail, call];
      if (call.targetService === to) {
        paths.push(next);
        if (paths.length >= maxPaths) return;
        continue;
      }
      seen.add(call.targetService);
      walk(call.targetService, next, seen);
      seen.delete(call.targetService);
    }
  };
  walk(from, [], new Set([from]));
  // Лучший путь = худшее звено лучше, потом короче.
  const preference = (path) => {
    const worst = Math.max(...path.map((c) => TIER_RANK[c.tier] ?? 4));
    return [worst, path.length];
  };
  paths.sort((a, b) => {
    const sa = preference(a), sb = preference(b);
    return sa[0] - sb[0] || sa[1] - sb[1];
  });
  return paths;
}

function pathParticipants(calls) {
  const seen = new Map();
  for (const call of calls) {
    if (!seen.has(call.sourceService)) seen.set(call.sourceService, call.sourceLabel);
    if (!seen.has(call.targetService)) seen.set(call.targetService, call.targetLabel);
  }
  return [...seen.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "ru"));
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

function reconstructionPayload() {
  return state.graph?.architectureRegistry?.processReconstruction || null;
}

function reconstructionExpectedEdge(stepId) {
  return (state.graph?.architectureRegistry?.expectedProcessGraph?.expectedEdges || [])
    .find((item) => item.expectedEdgeId === stepId) || null;
}

function reconstructionStatus(status) {
  return RECONSTRUCTION_STATUS[status] || { label: status || "не определено", className: "unknown" };
}

function reconstructionLayerLabel(key, value) {
  const labels = {
    route: {
      proven_contract: "контракт доказан кодом",
      proven_code_boundary: "граница найдена в коде",
      candidate_contract: "технический кандидат",
      missing: "маршрут не найден",
    },
    transportConfiguration: {
      binding_resolved: "binding транспорта разрешён",
      address_resolved: "адрес транспорта разрешён",
      contains_unresolved_placeholder: "в адресе остался placeholder",
      operation_only: "найдена операция без deployment-адреса",
      missing: "конфигурация не найдена",
    },
    requestLineage: {
      field_linked: "DTO и поля запроса связаны",
      models_only: "найдены только модели запроса",
      incomplete: "запрос раскрыт не полностью",
    },
    responseLineage: {
      used_by_caller: "ответ прослежен до использования",
      response_proven: "ответ доказан, продолжение не найдено",
      transformed_and_forwarded: "ответ преобразован и передан дальше",
      transformed: "ответ преобразован в вызывающем сервисе",
      fields_consumed: "поля ответа прочитаны вызывающим сервисом",
      not_available_for_process_route: "ответ найден у контракта, но не на маршруте этого процесса",
      not_proven: "ответ не доказан",
    },
  };
  return labels[key]?.[value] || value || "не определено";
}

function renderReconstructionReference(reference) {
  const isBoundary = reference.kind === "external_code_boundary";
  const contractLink = reference.contractId
    ? `<a href="${esc(mappingViewUrl(reference.contractId))}">Excel-маппинг</a>`
    : "";
  const location = reference.sourceFile
    ? `${reference.sourceFile}${reference.sourceLine ? `:${reference.sourceLine}` : ""}`
    : "кодовая позиция не приложена";
  return `
    <div class="reconstruction-code-ref">
      <div>
        <strong>${esc(isBoundary
          ? `${reference.internalService || "Сервис"} → ${reference.externalComponent || "внешний компонент"}`
          : `${reference.sourceService || "?"} → ${reference.targetService || "?"}`)}</strong>
        <span>${esc(isBoundary ? "внешняя граница" : `этап ${reference.stage || "?"}`)} · ${esc(reference.codeProcessName || reference.codeProcessId || "")}</span>
      </div>
      <small>${esc(location)}</small>
      ${contractLink}
    </div>`;
}

function renderReconstructionStep(step, mode) {
  const status = reconstructionStatus(step.mappingStatus);
  const order = step.declaredStepOrder == null ? "порядок не задан" : `шаг ${step.declaredStepOrder}`;
  const codeOnly = step.comparisonStatus === "code_only";
  const business = codeOnly ? `
    <div class="reconstruction-business-cell code-only-placeholder">
      <div class="reconstruction-step-head"><span>Excel</span><b>не заявлено</b></div>
      <strong>Дополнительный переход реализации</strong>
      <p>Контракт найден в коде между участниками этого процесса.</p>
    </div>` : `
    <div class="reconstruction-business-cell">
      <div class="reconstruction-step-head">
        <span>${esc((step.interactionCodes || []).join(", ") || order)}</span>
        <b>${esc(status.label)}</b>
      </div>
      <strong>${esc(step.businessName || "Взаимодействие без названия")}</strong>
      <p>${esc(step.provider?.displayName || "Неизвестный поставщик")} → ${esc(step.consumer?.displayName || "Неизвестный потребитель")}</p>
      <small>${esc(order)}</small>
    </div>`;
  const implementation = `
    <div class="reconstruction-implementation-cell">
      ${(step.implementationReferences || []).length
        ? step.implementationReferences.map(renderReconstructionReference).join("")
        : step.implementationPlacementStatus === "contract_proven_process_position_unknown"
          ? `<div class="reconstruction-empty-ref contract-unplaced"><strong>Контракт доказан</strong><span>Вызов найден в коде, но его позиция в конкретной цепочке исполнения ещё не установлена.</span></div>`
          : `<div class="reconstruction-empty-ref"><strong>Разрыв реализации</strong><span>Ожидание есть в Excel, но причинный путь в загруженном коде не найден.</span></div>`}
    </div>`;
  const columns = mode === "business"
    ? business
    : mode === "implementation"
      ? implementation
      : `${business}<div class="reconstruction-link-marker" aria-hidden="true">→</div>${implementation}`;
  return `
    <button class="reconstruction-row mode-${esc(mode)} status-${esc(status.className)} ${step.businessStepId === state.reconstruction.selectedStepId ? "selected" : ""}"
      data-business-step="${esc(step.businessStepId)}" type="button">
      ${columns}
    </button>`;
}

function renderReconstructionDetail(step) {
  const detail = $("reconstruction-detail");
  if (!step) {
    detail.innerHTML = `<div class="empty">Выберите бизнес-шаг, чтобы увидеть Excel, код, DTO и статус каждого слоя.</div>`;
    return;
  }
  const status = reconstructionStatus(step.mappingStatus);
  const coverage = step.evidenceCoverage || {};
  const quality = step.qualityDiagnostics || {};
  const continuity = quality.processContinuity || {};
  const sourceRefs = step.sourceRefs || [];
  const ai = step.aiVerification || {};
  const aiAdmission = ai.finalAdmission || {};
  const contractIds = uniq([
    step.contractId,
    ...(step.implementationReferences || []).map((item) => item.contractId),
  ].filter(Boolean));
  const expectedEdge = reconstructionExpectedEdge(step.businessStepId) || {};
  const contractEvidence = expectedEdge.implementationEvidence || step.implementationEvidence || [];
  const bindingEvidence = expectedEdge.contractBindingEvidence || {};
  const codeOnly = step.comparisonStatus === "code_only";
  detail.innerHTML = `
    <div class="reconstruction-detail-head status-${esc(status.className)}">
      <span>${esc((step.interactionCodes || []).join(", ") || "Бизнес-шаг")}</span>
      <h3>${esc(step.businessName || "Взаимодействие")}</h3>
      <b>${esc(status.label)}</b>
    </div>
    <section>
      <h4>Ожидание реестра</h4>
      ${codeOnly ? `<p class="reconstruction-code-only-note">Такого перехода нет в выбранном Excel-процессе. Он показан, потому что анализатор нашёл доказанный контракт между его участниками.</p>` : `<dl class="reconstruction-facts">
        <dt>Поставщик</dt><dd>${esc(step.provider?.displayName || "не разрешён")}</dd>
        <dt>Потребитель</dt><dd>${esc(step.consumer?.displayName || "не разрешён")}</dd>
        <dt>Порядок</dt><dd>${step.declaredStepOrder == null ? "в Excel не задан" : esc(step.declaredStepOrder)}</dd>
        <dt>Статус сверки</dt><dd>${esc(RECONSTRUCTION_COMPARISON_STATUS[step.comparisonStatus] || step.comparisonStatus || "не определён")}</dd>
        <dt>Тип разрыва</dt><dd>${esc(RECONSTRUCTION_GAP_DISPOSITION[step.gapDisposition] || step.gapDisposition || "не применимо")}</dd>
      </dl>`}
      ${sourceRefs.length ? `<div class="reconstruction-sources">${sourceRefs.map((ref) => `
        <div><b>${esc(ref.sheet || "Excel")}</b><span>${esc(ref.file || "")} · строка ${esc(ref.row || "?")}</span></div>
      `).join("")}</div>` : `<p class="muted">Ссылка на строку Excel не приложена.</p>`}
    </section>
    <section>
      <h4>Покрытие доказательствами</h4>
      <dl class="reconstruction-facts">
        <dt>Маршрут</dt><dd>${esc(reconstructionLayerLabel("route", coverage.route))}</dd>
        <dt>Конфигурация</dt><dd>${esc(reconstructionLayerLabel("transportConfiguration", coverage.transportConfiguration))}</dd>
        <dt>Запрос</dt><dd>${esc(reconstructionLayerLabel("requestLineage", coverage.requestLineage))}</dd>
        <dt>Ответ</dt><dd>${esc(reconstructionLayerLabel("responseLineage", coverage.responseLineage))}</dd>
        <dt>Связи полей</dt><dd>${fmt(coverage.verifiedRequestFieldLinkCount)} запрос · ${fmt(coverage.verifiedResponseFieldLinkCount)} ответ</dd>
        <dt>Ссылки на код</dt><dd>${fmt(coverage.codeReferenceCount)}</dd>
        ${continuity.status ? `<dt>Продолжение процесса</dt><dd>${esc({
          same_process_proven: "тот же процесс доказан",
          same_process_supported: "тот же процесс подтверждается идентификаторами",
          independent_event: "отдельное событие, не продолжение исходного процесса",
          unknown: "связь экземпляров процесса не доказана",
        }[continuity.status] || continuity.status)}</dd>` : ""}
        ${(continuity.correlationFields || []).length ? `<dt>Сквозные идентификаторы</dt><dd>${esc(continuity.correlationFields.join(", "))}</dd>` : ""}
      </dl>
      ${(quality.gaps || []).length ? `<div class="reconstruction-warning"><b>Что ещё не доказано:</b> ${esc(quality.gaps.map((gap) => ({
        route_not_proven: "полный маршрут",
        transport_configuration_not_resolved: "физический адрес или канал",
        request_fields_not_verified: "связи полей запроса",
        response_not_proven: "возвращение ответа",
        response_fields_not_verified: "связи полей ответа",
        consumer_fields_missing_in_mapping: "поля, которые ожидает получатель",
        mapping_not_fully_verified: "полнота Excel-маппинга",
        process_position_not_proven: "место вызова внутри процесса",
      }[gap] || gap)).join("; "))}</div>` : ""}
    </section>
    ${bindingEvidence.status ? `<section>
      <h4>Как выбрана кодовая операция</h4>
      <p class="reconstruction-binding-verdict">${esc({
        unique_service_pair: "Между участниками найден один доказанный контракт.",
        semantic_operation_match: "Из нескольких контрактов выбран тот, чья операция совпадает с названием и точками взаимодействия в Excel.",
        bounded_ai_operation_match: "Из нескольких контрактов AI-проверяющий выбрал конкретную операцию и подтвердил её ссылками на код с обеих сторон.",
        ambiguous_service_pair: "Между участниками есть несколько контрактов, но Excel не позволяет однозначно выбрать нужную операцию.",
        bidirectional_direction_conflict: "В коде найдены доказанные контракты в обоих направлениях; требуется проверить смысл направления в Excel.",
      }[bindingEvidence.status] || bindingEvidence.status)}</p>
      ${(bindingEvidence.candidates || []).map((candidate) => {
        const matches = [
          ...(candidate.pointMatches?.exact || []),
          ...(candidate.pointMatches?.contained || []),
          ...(candidate.pointMatches?.near || []),
          ...(candidate.nameMatches?.exact || []),
          ...(candidate.nameMatches?.contained || []),
          ...(candidate.nameMatches?.near || []),
        ];
        return `<div class="reconstruction-binding-candidate ${candidate.selected ? "selected" : "rejected"}">
          <b>${candidate.selected ? "выбран" : "не привязан"}</b>
          <span>${esc(candidate.contractId || "контракт без ID")}</span>
          <small>${candidate.selectionEvidence === "bounded_ai_with_verified_code_citations"
            ? "выбрано AI-проверкой по проверенным ссылкам на код"
            : matches.length
              ? `совпали признаки: ${esc(uniq(matches).join(", "))}`
              : "совпадающих признаков операции нет"}</small>
        </div>`;
      }).join("")}
    </section>` : ""}
    <section>
      <h4>Реализация</h4>
      ${(step.implementationReferences || []).map(renderReconstructionReference).join("") || (step.implementationPlacementStatus === "contract_proven_process_position_unknown"
        ? `<p class="reconstruction-gap-text">Контракт подтверждён кодом и Excel, но точка размещения в одной из восстановленных цепочек исполнения не доказана.</p>`
        : `<p class="reconstruction-gap-text">Кодовый путь не найден. Это видимый gap, а не скрытый пропуск диаграммы.</p>`)}
      ${contractIds.map((contractId) => `<a class="mini-btn wide" href="${esc(mappingViewUrl(contractId))}">Открыть маппинг ${esc(contractId)}</a>`).join("")}
      ${(step.codeOrderEvidence || []).length ? `<details><summary>Показать доказанный порядок (${fmt(step.codeOrderEvidence.length)})</summary><div class="reconstruction-field-links">${step.codeOrderEvidence.map((item) => `<span>${esc(item.fromBusinessStepId)} → ${esc(item.toBusinessStepId)} · ${esc(item.kind)} · ${esc(item.evidence)}</span>`).join("")}</div></details>` : `<p class="muted">Причинная связь этого шага с соседними бизнес-шагами не доказана.</p>`}
    </section>
    ${contractEvidence.map((evidence) => {
      const transport = evidence.transportEvidence || {};
      const request = evidence.requestLineage || {};
      const response = evidence.responseLineage || {};
      const mapping = evidence.mappingEvidence || {};
      return `<section class="reconstruction-contract-evidence ${evidence.candidate ? "candidate" : "confirmed"}">
        <h4>${esc(evidence.sourceService || "?")} → ${esc(evidence.targetService || "?")} ${evidence.candidate ? "· кандидат" : "· подтверждён"}</h4>
        <dl class="reconstruction-facts">
          <dt>Транспорт</dt><dd>${esc(evidence.transport || "не определён")}</dd>
          <dt>Адрес / канал</dt><dd>${esc(evidence.transportAddress || transport.sourceAddress || "не разрешён")}</dd>
          <dt>Конфигурация</dt><dd>${esc(reconstructionLayerLabel("transportConfiguration", transport.configurationStatus))}</dd>
          <dt>Профиль конфигурации</dt><dd>${esc((transport.configurationProfiles || []).join(", ") || "не задан или общий")}</dd>
          <dt>Источник конфигурации</dt><dd>${esc((transport.configurationSources || []).join(", ") || "не приложен")}</dd>
          <dt>DTO запроса</dt><dd>${esc((request.sourceModelTypes || []).join(", ") || "не найден")}</dd>
          <dt>DTO ресивера</dt><dd>${esc((request.targetModelTypes || []).join(", ") || "не найден")}</dd>
          <dt>Основание DTO запроса</dt><dd>${esc([...(request.sourceModelEvidence || []), ...(request.targetModelEvidence || [])].join(", ") || "тип без раскрытого источника")}</dd>
          <dt>Поля запроса</dt><dd>${fmt(request.verifiedFieldLinkCount)} подтверждено</dd>
          <dt>DTO ответа</dt><dd>${esc((response.callerModelTypes || []).join(", ") || "не найден")}</dd>
          <dt>Ответ у ресивера</dt><dd>${esc((response.receiverModelTypes || []).join(", ") || "не найден")}</dd>
          <dt>Продолжение ответа</dt><dd>${esc(reconstructionLayerLabel("responseLineage", response.status))}</dd>
          <dt>Маршруты ответа</dt><dd>${esc((response.executionRouteIds || []).join(", ") || "не привязаны")}</dd>
          ${mapping.status ? `<dt>Excel-маппинг</dt><dd>${esc({
            complete: "полный",
            partial: "частичный",
            missing: "не сформирован",
          }[mapping.status] || mapping.status)} · ${fmt(mapping.resolvedFieldRowCount)} подтверждено${mapping.unresolvedRowCount ? ` · ${fmt(mapping.unresolvedRowCount)} не доказано` : ""}</dd>
          <dt>Покрытие получателя</dt><dd>${esc({
            complete: "все используемые поля покрыты",
            gap: "часть используемых полей отсутствует",
            unknown: "используемые поля не определены",
          }[mapping.consumerCoverageStatus] || mapping.consumerCoverageStatus || "не определено")}</dd>` : ""}
        </dl>
        ${(mapping.missingConsumerFields || []).length ? `<p class="reconstruction-warning"><b>Получатель использует, но передача не доказана:</b> ${esc(mapping.missingConsumerFields.join(", "))}</p>` : ""}
        ${mapping.coverageNote ? `<p class="muted">${esc(mapping.coverageNote)}</p>` : ""}
        ${(request.fieldLinkSample || []).length ? `<details><summary>Показать связанные поля запроса</summary><div class="reconstruction-field-links">${request.fieldLinkSample.map((field) => `<span>${esc((field.sourcePaths || []).join(" / ") || field.field)} → ${esc((field.targetPaths || []).join(" / ") || field.field)}</span>`).join("")}</div></details>` : ""}
        ${(response.fieldLinkSample || []).length ? `<details><summary>Показать связанные поля ответа</summary><div class="reconstruction-field-links">${response.fieldLinkSample.map((field) => `<span>${esc((field.sourcePaths || []).join(" / ") || field.field)} → ${esc((field.targetPaths || []).join(" / ") || field.field)}</span>`).join("")}</div></details>` : ""}
      </section>`;
    }).join("")}
    ${step.responseContinuation?.status && step.responseContinuation.status !== "not_proven" ? `<section>
      <h4>Что происходит с ответом в этом процессе</h4>
      <p><b>${esc(reconstructionLayerLabel("responseLineage", step.responseContinuation.status))}</b> · маршрутов: ${fmt(step.responseContinuation.executionRouteIds?.length)} · прочитано полей: ${fmt(step.responseContinuation.usedResponseFields?.length)}</p>
      ${(step.responseContinuation.receiverModelTypes || []).length || (step.responseContinuation.callerModelTypes || []).length ? `<p><b>Путь ответа:</b> ${esc((step.responseContinuation.receiverModelTypes || []).join(", ") || "тип ресивера не найден")} → ${esc((step.responseContinuation.callerModelTypes || []).join(", ") || "тип вызывающего не найден")}${(step.responseContinuation.callerVariables || []).length ? ` → ${esc(step.responseContinuation.callerVariables.join(", "))}` : ""}</p>` : ""}
      ${step.responseContinuation.scopeStatus === "contract_level_fallback" ? `<p class="reconstruction-warning">Продолжение доказано на уровне контракта, но старый снимок не содержит route ID. После нового анализа оно будет привязано к конкретному пути исполнения.</p>` : ""}
      ${(step.responseContinuation.transformations || []).map((item) => `<div class="reconstruction-code-ref"><strong>${esc(item.receiver || "")}.${esc(item.method || "")}</strong><small>${esc((item.sourceVariables || []).join(", "))} → ${esc((item.resultVariables || []).join(", "))} · строка ${esc(item.line || "?")}</small></div>`).join("")}
      ${(step.responseContinuation.sinks || []).map((item) => `<div class="reconstruction-code-ref"><strong>Дальнейший вызов: ${esc(item.receiver || "")}.${esc(item.method || "")}</strong><small>${esc((item.variables || []).join(", "))} · строка ${esc(item.line || "?")}</small></div>`).join("")}
    </section>` : ""}
    ${ai.status ? `<section>
      <h4>AI-проверка</h4>
      <p><b>${esc(aiAdmission.status === "accepted" ? "принято" : aiAdmission.status === "rejected" ? "отклонено" : "ожидает проверки")}</b> · ${esc({
        concrete_gap_and_tool_citation_verified: "разрыв конкретен, ссылки на код проверены",
        no_tool_citation_resolves_to_source_file: "ни одна ссылка AI не разрешилась в исходный файл",
        cross_service_claim_missing_citation_for_one_side: "AI не привёл проверяемые ссылки на код обеих сторон",
      }[aiAdmission.reason] || aiAdmission.reason || "детерминированная проверка ещё не завершена")}</p>
      ${(ai.serviceResults || []).map((item) => `<div class="reconstruction-ai-result"><b>${esc(item.serviceId)}</b><span>${esc(item.summary || (item.missingEvidence || []).join("; ") || item.status)}</span></div>`).join("")}
      ${(ai.verifiedCodeLocations || []).length ? `<details><summary>Показать проверенные ссылки на код</summary><div class="reconstruction-field-links">${ai.verifiedCodeLocations.map((item) => `<span>${esc(item.path || "")}:${esc(item.line || "?")}</span>`).join("")}</div></details>` : ""}
      <small>AI не имеет права добавлять стрелку без проверенной ссылки на код.</small>
    </section>` : ""}
  `;
}

function setReconstructionMode(mode) {
  state.reconstruction.mode = ["business", "implementation", "compare"].includes(mode) ? mode : "compare";
  const params = new URLSearchParams(window.location.search);
  params.set("reconMode", state.reconstruction.mode);
  window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  renderReconstructionView();
}

function reconstructionContractIds(process) {
  return uniq([
    ...(process.businessLayer?.steps || []),
    ...(process.implementationLayer?.codeOnlySteps || []),
  ].flatMap((step) => [
    step.contractId,
    ...(step.implementationReferences || []).map((reference) => reference.contractId),
  ]).filter(Boolean));
}

function reconstructionSourceRefs(process) {
  const seen = new Set();
  return (process.businessLayer?.steps || []).flatMap((step) => step.sourceRefs || []).filter((reference) => {
    const key = `${reference.file || ""}|${reference.sheet || ""}|${reference.row || ""}`;
    if (!reference.file || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function reconstructionExportContracts(process, packageMode) {
  const result = {};
  const contractIds = reconstructionContractIds(process);
  for (let start = 0; start < contractIds.length; start += 8) {
    const batch = contractIds.slice(start, start + 8);
    const details = await Promise.all(batch.map(async (contractId) => {
      const detail = await api(`/api/snapshots/${encodeURIComponent(state.snapshot.id)}/contract-detail?contract_id=${encodeURIComponent(contractId)}`);
      return [contractId, detail];
    }));
    details.forEach(([contractId, detail]) => {
      const fileName = String(detail.crossServiceDataSurf?.file || "").split(/[\\/]/).pop();
      result[contractId] = {
        sourceService: detail.sourceService || "",
        targetService: detail.targetService || "",
        mappingHref: packageMode && fileName ? `mappings/${encodeURIComponent(fileName)}` : mappingViewUrl(contractId),
      };
    });
  }
  return result;
}

async function exportReconstruction(kind) {
  const reconstruction = reconstructionPayload();
  const process = (reconstruction?.processes || []).find(
    (item) => item.reconstructedProcessId === state.reconstruction.processId
  );
  if (!process || !state.snapshot?.id || !window.AIProfilerReconstructionExport) return;
  const button = $(kind === "package" ? "reconstruction-export-package" : "reconstruction-export-html");
  const oldLabel = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = kind === "package" ? "Собираю ZIP…" : "Собираю HTML…";
  }
  try {
    const packageMode = kind === "package";
    const contracts = await reconstructionExportContracts(process, packageMode);
    const title = `AI Profiler — ${process.name}`;
    const html = window.AIProfilerReconstructionExport.buildHtml({
      title,
      snapshotName: state.snapshot.name || state.snapshot.id,
      process,
      contracts,
      packageMode,
    });
    const safeName = String(process.name || process.reconstructedProcessId || "process")
      .replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]+/g, "_");
    if (!packageMode) {
      return download(`process_reconstruction_${safeName}.html`, new Blob([html], { type: "text/html;charset=utf-8" }));
    }
    const response = await fetch(`/api/snapshots/${encodeURIComponent(state.snapshot.id)}/reconstruction-package`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        html,
        contractIds: reconstructionContractIds(process),
        processName: process.name || "",
        reconstructedProcessId: process.reconstructedProcessId || "",
        sourceRefs: reconstructionSourceRefs(process),
        process,
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.detail || `${response.status} ${response.statusText}`);
    }
    return download(`ai_profiler_${safeName}_reconstruction.zip`, await response.blob());
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

function renderReconstructionAiQueue(process) {
  const panel = $("reconstruction-ai-queue");
  if (!panel) return;
  if (state.reconstruction.aiQueueProcessId !== process.reconstructedProcessId) {
    panel.innerHTML = `<div class="reconstruction-ai-head"><div><h3>AI-проверка разрывов</h3><p>Загружаю очередь только для выбранного процесса…</p></div></div>`;
    if (!state.reconstruction.aiQueueLoading) loadReconstructionAiQueue(process.reconstructedProcessId);
    return;
  }
  const queue = state.reconstruction.aiQueue || { summary: {}, tasks: [] };
  if (queue.unavailable) {
    panel.innerHTML = `
      <div class="reconstruction-ai-head">
        <div>
          <h3>AI-проверка разрывов</h3>
          <p>Для запуска проверяющего агента подключите backend AI Profiler. Просмотр отчёта и доказательств доступен без него.</p>
        </div>
        <span class="badge warn">backend не подключён</span>
      </div>`;
    return;
  }
  const summary = queue.summary || {};
  const tasks = queue.tasks || [];
  const queuedTasks = tasks.filter((task) => task.researchable && ["queued", "retryable_error"].includes(task.queueStatus));
  const batchSize = Math.min(10, queuedTasks.length);
  const verification = state.reconstruction.aiVerification;
  const claims = verification?.claims || [];
  const priorityLabels = {
    candidate_and_both_sources: "обе стороны + технический кандидат",
    both_sources: "исходники доступны с обеих сторон",
    candidate_and_one_source: "одна сторона + технический кандидат",
    one_source: "исходники доступны с одной стороны",
    researched: "уже исследовано",
    admitted: "уже принято",
    not_researchable: "исходники не привязаны",
  };
  panel.innerHTML = `
    <div class="reconstruction-ai-head">
      <div><h3>AI-проверка разрывов</h3><p>Агент получает один конкретный переход, исследует обе стороны и возвращает проверяемые ссылки. Снимок не меняется автоматически.</p></div>
      <div class="reconstruction-ai-head-actions">
        <div class="reconstruction-ai-counts">
          <span><b>${fmt(summary.taskCount)}</b> задач</span>
          <span><b>${fmt(summary.queued)}</b> в очереди</span>
          <span><b>${fmt(summary.retryable_error)}</b> можно повторить</span>
          <span><b>${fmt(summary.researched)}</b> исследовано</span>
          <span><b>${fmt(summary.admitted)}</b> принято</span>
        </div>
        ${batchSize ? `<button class="btn secondary" type="button" data-reconstruction-ai-batch ${state.reconstruction.aiVerificationRunning ? "disabled" : ""}>Проверить следующие ${fmt(batchSize)}</button>` : ""}
      </div>
    </div>
    ${verification ? `<div class="reconstruction-ai-journal">
      <strong>Последний черновой запуск</strong>
      <span>${verification.selectedTaskIds?.length ? `проверено задач: ${fmt(verification.selectedTaskIds.length)}` : esc(verification.skipped || "нет задач")}</span>
      <span>admission: ${fmt(verification.finalAdmission?.accepted)} принято · ${fmt(verification.finalAdmission?.rejected)} отклонено</span>
      ${verification.batchReport ? `<span>результаты: ${Object.entries(verification.batchReport.resultStatusCounts || {}).map(([status, count]) => `${esc(status)} ${fmt(count)}`).join(" · ") || "нет"}</span>` : ""}
      ${claims.map((claim) => `<div><b>${esc(claim.interactionCode || claim.registryRowId || "гипотеза")}</b><span>${esc((claim.finalAdmission || {}).status || "не допущена")} · ${fmt((claim.verifiedCodeLocations || []).length)} проверенных ссылок</span></div>`).join("")}
      ${verification.canCommit ? `<button class="btn" type="button" data-reconstruction-ai-commit ${state.reconstruction.aiCommitRunning ? "disabled" : ""}>${claims.some((claim) => (claim.finalAdmission || {}).status === "accepted") ? "Сохранить проверенный снимок" : "Сохранить отрицательный аудит"}</button>` : `<small>Для сохранения сначала нужно исследовать хотя бы одну задачу.</small>`}
    </div>` : ""}
    <details class="reconstruction-ai-tasks" ${tasks.length <= 8 ? "open" : ""}>
      <summary>Показать задачи процесса (${fmt(tasks.length)})</summary>
      <div>${tasks.slice(0, 40).map((task) => `
        <article class="reconstruction-ai-task status-${esc(task.queueStatus)}">
          <div><b>${esc((task.interactionCode || []).join?.(", ") || task.interactionCode || task.name || "Переход")}</b><span>${esc(task.providerComponent || "?")} → ${esc(task.consumerComponent || "?")}</span><small>${esc((task.priority?.reasons || []).join(" · "))}</small></div>
          <div class="reconstruction-ai-priority"><b>${esc(priorityLabels[task.priority?.band] || task.priority?.band || "без приоритета")}</b><span>${esc({ queued: "ожидает проверки", retryable_error: "ошибка LLM, можно повторить", researched: "исследовано, но не допущено", admitted: "допущено", not_researchable: "нет доступных исходников" }[task.queueStatus] || task.queueStatus)}</span></div>
          ${task.researchable ? `<button class="mini-btn" type="button" data-reconstruction-ai-task="${esc(task.taskId)}" ${state.reconstruction.aiVerificationRunning ? "disabled" : ""}>Проверить</button>` : ""}
        </article>`).join("")}</div>
      ${tasks.length > 40 ? `<small>Показаны первые 40 задач из ${fmt(tasks.length)}.</small>` : ""}
    </details>`;
  panel.querySelectorAll("[data-reconstruction-ai-task]").forEach((button) => {
    button.onclick = () => runReconstructionAiVerification(button.dataset.reconstructionAiTask);
  });
  panel.querySelector("[data-reconstruction-ai-batch]")?.addEventListener("click", () => {
    runReconstructionAiVerification("", batchSize);
  });
  panel.querySelector("[data-reconstruction-ai-commit]")?.addEventListener("click", commitReconstructionAiVerification);
}

async function loadReconstructionAiQueue(processId) {
  state.reconstruction.aiQueueLoading = true;
  try {
    const queue = await api(`/api/snapshots/${encodeURIComponent(state.snapshot.id)}/reconstruction-ai-queue?process_id=${encodeURIComponent(processId)}`);
    if (state.reconstruction.processId !== processId) return;
    state.reconstruction.aiQueueProcessId = processId;
    state.reconstruction.aiQueue = queue;
  } catch (error) {
    state.reconstruction.aiQueueProcessId = processId;
    state.reconstruction.aiQueue = { summary: {}, tasks: [], unavailable: true, message: error?.message || String(error) };
  } finally {
    state.reconstruction.aiQueueLoading = false;
    if (state.reconstruction.processId === processId) renderReconstructionView();
  }
}

async function runReconstructionAiVerification(taskId = "", maxTasks = 1) {
  if (!state.snapshot?.id || !state.reconstruction.processId) return;
  const button = taskId
    ? document.querySelector(`[data-reconstruction-ai-task="${CSS.escape(taskId)}"]`)
    : document.querySelector("[data-reconstruction-ai-batch]");
  const oldLabel = button?.textContent;
  state.reconstruction.aiVerificationRunning = true;
  if (button) {
    button.disabled = true;
    button.textContent = taskId ? "Исследую…" : "Исследую пакет…";
  }
  try {
    state.reconstruction.aiVerification = await api(
      `/api/snapshots/${encodeURIComponent(state.snapshot.id)}/reconstruction-ai-verify`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reconstructedProcessId: state.reconstruction.processId, taskIds: taskId ? [taskId] : [], maxTasks }),
      }
    );
    renderReconstructionView();
  } catch (error) {
    showError(error);
  } finally {
    state.reconstruction.aiVerificationRunning = false;
    if (button) {
      button.disabled = false;
      button.textContent = oldLabel;
    }
  }
}

async function commitReconstructionAiVerification() {
  const verification = state.reconstruction.aiVerification;
  if (!state.snapshot?.id || !verification?.verificationId || !verification.canCommit) return;
  const sourceSnapshotId = state.snapshot.id;
  const button = document.querySelector("[data-reconstruction-ai-commit]");
  const oldLabel = button?.textContent;
  state.reconstruction.aiCommitRunning = true;
  if (button) {
    button.disabled = true;
    button.textContent = "Сохраняю снимок…";
  }
  try {
    const result = await api(
      `/api/snapshots/${encodeURIComponent(sourceSnapshotId)}/reconstruction-ai-commit`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationId: verification.verificationId }),
      }
    );
    const snapshotId = result.snapshot?.id;
    if (!snapshotId) throw new Error("Сервер не вернул ID нового снимка");
    const params = new URLSearchParams(window.location.search);
    params.set("snapshot", snapshotId);
    params.set("businessProcess", state.reconstruction.processId);
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
    await loadSnapshots();
  } catch (error) {
    showError(error);
  } finally {
    state.reconstruction.aiCommitRunning = false;
    if (button) {
      button.disabled = false;
      button.textContent = oldLabel;
    }
  }
}

function renderReconstructionView() {
  const reconstruction = reconstructionPayload();
  const board = $("reconstruction-board");
  const processSelect = $("reconstruction-process");
  if (!reconstruction?.processes?.length) {
    const loading = !state.snapshot || $("api-state")?.textContent === "loading";
    $("reconstruction-summary").textContent = loading
      ? "Загружаю сверку бизнес-процесса с кодом…"
      : "В этом снимке ещё нет Process Reconstruction v2.";
    $("reconstruction-metrics").innerHTML = "";
    board.innerHTML = `<div class="empty">${loading
      ? "Читаю ожидаемые шаги Excel и доказательства из кода."
      : "Пересоберите системный отчёт с архитектурным Excel: старые снимки не содержат двухслойный IR."}</div>`;
    renderReconstructionDetail(null);
    return;
  }
  const processes = reconstruction.processes;
  if (!processes.some((item) => item.reconstructedProcessId === state.reconstruction.processId)) {
    state.reconstruction.processId = processes[0].reconstructedProcessId;
  }
  const process = processes.find((item) => item.reconstructedProcessId === state.reconstruction.processId);
  processSelect.innerHTML = processes.map((item) => `
    <option value="${esc(item.reconstructedProcessId)}">${esc(item.name)} · ${fmt(item.comparisonLayer?.expectedStepCount)} шагов</option>
  `).join("");
  processSelect.value = process.reconstructedProcessId;
  const businessSteps = process.businessLayer?.steps || [];
  const codeOnlySteps = process.implementationLayer?.codeOnlySteps || [];
  const implementedBusinessSteps = businessSteps.filter((item) =>
    (item.implementationReferences || []).length || item.implementationPlacementStatus === "contract_proven_process_position_unknown"
  );
  const steps = state.reconstruction.mode === "business"
    ? businessSteps
    : state.reconstruction.mode === "implementation"
      ? [...implementedBusinessSteps, ...codeOnlySteps]
      : [...businessSteps, ...codeOnlySteps];
  if (!steps.some((item) => item.businessStepId === state.reconstruction.selectedStepId)) {
    state.reconstruction.selectedStepId = steps[0]?.businessStepId || "";
  }
  const selected = steps.find((item) => item.businessStepId === state.reconstruction.selectedStepId);
  const comparison = process.comparisonLayer || {};
  const expectedCount = Number(comparison.expectedStepCount || 0);
  const implementedCount = Number(comparison.implementedStepCount || 0);
  const processCoverage = expectedCount > 0 ? (implementedCount / expectedCount) * 100 : 0;
  const loadedCorpusCoverage = comparison.loadedCorpusCoverage || {};
  const coverageMetrics = loadedCorpusCoverage.metrics || comparison.coverageMetrics || {};
  const eligibleCount = Number(loadedCorpusCoverage.eligibleStepCount || 0);
  const eligibleImplemented = Number(loadedCorpusCoverage.implementedEligibleStepCount || 0);
  const eligibleCoverage = eligibleCount > 0 ? (eligibleImplemented / eligibleCount) * 100 : 0;
  const coverageCards = [
    ["route", "маршрут"],
    ["transport", "транспорт"],
    ["requestModel", "DTO запроса"],
    ["requestFields", "поля запроса"],
    ["response", "ответ"],
    ["responseFields", "поля ответа"],
    ["codePosition", "позиция по коду"],
    ["codeCausality", "причинный порядок по коду"],
    ["declaredOrder", "порядок из реестра"],
  ];
  $("reconstruction-summary").textContent = `${process.name} · ${process.businessLayer?.orderEvidence?.status === "not_declared" ? "Excel задаёт состав, но не порядок" : "порядок заявлен в Excel"}`;
  $("reconstruction-metrics").innerHTML = `
    <div><strong>${fmt(expectedCount)}</strong><span>ожидается по Excel</span></div>
    <div><strong>${fmt(implementedCount)}</strong><span>реализация найдена</span></div>
    <div><strong>${processCoverage.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%</strong><span>покрытие процесса кодом</span></div>
    ${eligibleCount ? `<div><strong>${eligibleCoverage.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%</strong><span>покрытие доступных сервисов · ${fmt(eligibleImplemented)} / ${fmt(eligibleCount)}</span></div>` : ""}
    <div><strong>${fmt(comparison.candidateStepCount)}</strong><span>кандидаты</span></div>
    <div><strong>${fmt(comparison.actionableGapStepCount)}</strong><span>разрывы анализатора</span></div>
    <div><strong>${fmt(Number(comparison.externalBoundaryStepCount || 0) + Number(comparison.outsideCorpusStepCount || 0))}</strong><span>границы загруженного корпуса</span></div>
    <div><strong>${fmt(process.implementationLayer?.codeProcessIds?.length)} / ${fmt(comparison.codeOnlyStepCount)}</strong><span>code-процессов / переходов только в коде</span></div>
    <div class="reconstruction-layer-coverage">
      <strong>${eligibleCount ? "Покрытие доказательств внутри доступного корпуса" : "Покрытие отдельных слоёв доказательств"}</strong>
      <div>${coverageCards.map(([key, label]) => {
        const metric = coverageMetrics[key] || {};
        return `<span><b>${fmt(metric.covered)} / ${fmt(metric.total)}</b><i>${esc(label)} · ${fmt(metric.pct)}%</i></span>`;
      }).join("")}${loadedCorpusCoverage.mappingConsumerComplete ? `<span><b>${fmt(loadedCorpusCoverage.mappingConsumerComplete.covered)} / ${fmt(loadedCorpusCoverage.mappingConsumerComplete.total)}</b><i>Excel покрывает получателя · ${fmt(loadedCorpusCoverage.mappingConsumerComplete.pct)}%</i></span>` : ""}</div>
    </div>`;
  for (const mode of ["business", "implementation", "compare"]) {
    $(`reconstruction-mode-${mode}`)?.classList.toggle("active", state.reconstruction.mode === mode);
  }
  board.innerHTML = `
    <div class="reconstruction-board-head mode-${esc(state.reconstruction.mode)}">
      ${state.reconstruction.mode !== "implementation" ? "<span>Ожидание из Excel</span>" : ""}
      ${state.reconstruction.mode === "compare" ? "<i></i>" : ""}
      ${state.reconstruction.mode !== "business" ? "<span>Фактическая реализация в коде</span>" : ""}
    </div>
    <div class="reconstruction-rows">${steps.length
      ? steps.map((step) => renderReconstructionStep(step, state.reconstruction.mode)).join("")
      : `<div class="empty">В этом режиме для процесса нет переходов.</div>`}</div>`;
  board.querySelectorAll("[data-business-step]").forEach((button) => {
    button.onclick = () => {
      state.reconstruction.selectedStepId = button.dataset.businessStep || "";
      const params = new URLSearchParams(window.location.search);
      params.set("businessStep", state.reconstruction.selectedStepId);
      window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
      renderReconstructionView();
    };
  });
  renderReconstructionDetail(selected);
  renderReconstructionAiQueue(process);
}

function renderArchitectureView() {
  const root = $("architecture-panel");
  const data = state.graph || {};
  const snapshot = data.snapshot || {};
  const runtime = data.runtime || {};
  const counts = data.counts || {};
  const integrity = data.integrity || {};
  const layers = data.storageModel?.layers || [];
  const relationships = data.storageModel?.relationships || [];
  const tableSizes = Object.fromEntries((data.tables || []).map((item) => [item.table_name, Number(item.total_bytes || 0)]));
  const tableLabels = {
    snapshots: "Снимки анализа",
    report_imports: "Журнал загрузок",
    source_groups: "Контуры ФП",
    services: "Сервисы",
    models: "Модели данных",
    model_fields: "Поля моделей",
    model_identity_nodes: "Идентичности моделей",
    model_identity_edges: "Связи идентичности",
    contracts: "Контракты",
    field_links: "Связи полей",
    processes: "Процессы",
    process_steps: "Шаги процессов",
    process_relations: "Причинные связи",
    evidence_refs: "Ссылки на доказательства",
    artifacts: "Excel и другие артефакты",
  };
  const latestMigration = (data.migrations || []).at(-1)?.version || "—";
  const tableRows = layers.flatMap((layer, layerIndex) => (layer.tables || []).map((table) => ({
    layer: layer.title,
    layerIndex,
    table,
    count: counts[table],
    bytes: tableSizes[table],
  })));
  root.innerHTML = `
    <header class="storage-console-head">
      <div class="storage-console-title">
        <div class="storage-breadcrumb"><span>Платформа данных</span><b>/</b><span>Архитектура</span></div>
        <h2>Модель хранения lineage</h2>
        <p>Версионированный снимок, нормализованный граф и доказательства анализа в едином контуре данных.</p>
      </div>
      <div class="storage-head-tools">
        <div class="storage-export-actions" aria-label="Экспорт архитектуры">
          <button class="btn" id="architecture-export-mermaid" type="button" title="Скачать редактируемую Mermaid-схему">Mermaid</button>
          <button class="btn" id="architecture-export-drawio" type="button" title="Скачать схему для diagrams.net">draw.io</button>
        </div>
        <div class="storage-runtime">
          <span class="storage-live"><i></i>Подключено</span>
          <div><small>PostgreSQL</small><b>${esc(String(runtime.server_version || "").split(" ")[0] || "—")}</b></div>
          <div><small>База</small><b>${esc(runtime.database_name || "—")}</b></div>
          <div><small>Схема</small><b>ai_profiler</b></div>
        </div>
      </div>
    </header>

    <div class="storage-statline">
      <div><span>Сервисы</span><strong>${fmt(counts.services)}</strong></div>
      <div><span>Модели</span><strong>${fmt(counts.models)}</strong></div>
      <div><span>Поля моделей</span><strong>${fmt(counts.model_fields)}</strong></div>
      <div><span>Контракты</span><strong>${fmt(counts.contracts)}</strong></div>
      <div><span>Шаги процессов</span><strong>${fmt(counts.process_steps)}</strong></div>
      <div><span>Доказательства</span><strong>${fmt(counts.evidence_refs)}</strong></div>
    </div>

    <div class="storage-workbench">
      <div class="storage-primary">
        <section class="storage-block storage-architecture-map">
          <header class="storage-block-head">
            <div><span>Контур данных</span><h3>Поставка и чтение снимка</h3></div>
            <p>Загрузка и публикация разделены. UI не читает файлы отчёта напрямую.</p>
          </header>
          <div class="storage-flow">
            <div class="storage-endpoint source">
              <small>Источник</small>
              <strong>Отчёт профайлера</strong>
              <span>JSON + Excel</span>
            </div>
            <div class="storage-flow-link"><b>01</b><span>Загрузка</span></div>
            <div class="storage-loader">
              <small>Ingestion</small>
              <strong>Report Loader</strong>
              <span>SHA-256 · проверка · транзакция</span>
            </div>
            <div class="storage-flow-link"><b>02</b><span>Commit</span></div>
            <div class="storage-database">
              <header><div><small>PostgreSQL</small><strong>${formatBytes(runtime.database_bytes)}</strong></div><span>${esc(snapshot.name || snapshot.snapshot_id || "—")}</span></header>
              <div class="storage-domains">
                ${layers.map((layer, index) => `
                  <div class="storage-domain domain-${index + 1}">
                    <b>${esc(layer.title)}</b>
                    <span>${fmt((layer.tables || []).length)} таблиц · ${fmt((layer.tables || []).reduce((total, table) => total + Number(counts[table] || 0), 0))} записей</span>
                  </div>
                `).join("")}
              </div>
            </div>
            <div class="storage-flow-link"><b>03</b><span>Read-only</span></div>
            <div class="storage-endpoint target">
              <small>Доступ</small>
              <strong>Bun API</strong>
              <span>UI · агенты · экспорт</span>
            </div>
          </div>
        </section>

        <section class="storage-block storage-inventory">
          <header class="storage-block-head">
            <div><span>Физическая модель</span><h3>Таблицы и объём данных</h3></div>
            <p>${fmt(tableRows.length)} предметных таблиц в четырёх слоях хранения.</p>
          </header>
          <div class="storage-table-wrap">
            <table class="storage-table">
              <thead><tr><th>Слой</th><th>Таблица</th><th>Назначение</th><th>Записей</th><th>Размер</th></tr></thead>
              <tbody>${tableRows.map((row) => `
                <tr>
                  <td><span class="storage-layer-mark layer-${row.layerIndex + 1}">${String(row.layerIndex + 1).padStart(2, "0")}</span></td>
                  <td><code>${esc(row.table)}</code></td>
                  <td>${esc(tableLabels[row.table] || row.table)}</td>
                  <td>${fmt(row.count)}</td>
                  <td>${formatBytes(row.bytes)}</td>
                </tr>
              `).join("")}</tbody>
            </table>
          </div>
        </section>
      </div>

      <aside class="storage-aside">
        <section class="storage-side-block">
          <header><span>Состояние</span><b>Рабочий контур</b></header>
          <dl class="storage-facts">
            <div><dt>Снимок</dt><dd>${esc(snapshot.name || snapshot.snapshot_id || "—")}</dd></div>
            <div><dt>Миграция</dt><dd>${esc(latestMigration)}</dd></div>
            <div><dt>Импорт</dt><dd>${esc(data.latestImport?.imported_at ? new Date(data.latestImport.imported_at).toLocaleString("ru-RU") : "—")}</dd></div>
            <div><dt>Исходный JSONB</dt><dd>${formatBytes(snapshot.document_bytes)}</dd></div>
            <div><dt>Артефакты</dt><dd>${fmt(counts.artifacts)}</dd></div>
          </dl>
        </section>

        <section class="storage-side-block">
          <header><span>Целостность</span><b>Ограничения БД</b></header>
          <div class="storage-constraint-grid">
            <div><strong>${fmt(integrity.primary_keys)}</strong><span>PK</span></div>
            <div><strong>${fmt(integrity.foreign_keys)}</strong><span>FK</span></div>
            <div><strong>${fmt(integrity.indexes)}</strong><span>Индексы</span></div>
            <div><strong>${fmt(counts.report_imports)}</strong><span>Загрузки</span></div>
          </div>
          <p>Составные ключи изолируют прогоны. Внешние ключи контролируют каталог, процессы и связи полей.</p>
        </section>

        <section class="storage-side-block storage-relationships">
          <header><span>Граф</span><b>Ключевые отношения</b></header>
          <div>${relationships.map(([source, target, cardinality]) => `
            <span><i>${esc(tableLabels[source] || source)}</i><b>${esc(cardinality)}</b><i>${esc(tableLabels[target] || target)}</i></span>
          `).join("")}</div>
        </section>

        <section class="storage-side-block storage-source">
          <header><span>Происхождение</span><b>Контрольная сумма</b></header>
          <dl class="storage-facts">
            <div><dt>Snapshot ID</dt><dd><code>${esc(snapshot.snapshot_id || "—")}</code></dd></div>
            <div><dt>SHA-256</dt><dd><code>${esc(snapshot.source_hash || "—")}</code></dd></div>
            <div><dt>Источник</dt><dd><code>${esc(snapshot.source_file || "—")}</code></dd></div>
          </dl>
        </section>
      </aside>
    </div>`;
  $("architecture-export-mermaid")?.addEventListener("click", () => exportArchitecture("mermaid", data, tableLabels));
  $("architecture-export-drawio")?.addEventListener("click", () => exportArchitecture("drawio", data, tableLabels));
}

function exportArchitecture(kind, data, tableLabels) {
  const exporter = window.AIProfilerArchitectureExport;
  if (!exporter) return showError(new Error("Модуль экспорта архитектуры не загружен"));
  const snapshotName = String(data.snapshot?.name || data.snapshot?.snapshot_id || "snapshot");
  const safeName = snapshotName.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]+/g, "_");
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
  const directProcess = (state.graph?.processes || []).find((process) => process.processId === requestedProcess);
  state.sequence.processId = directProcess?.processId || "";
  state.sequence.processMembers = directProcess ? new Set(directProcess.memberServices || []) : null;
  state.sequence.selectedStage = directProcess && Number.isFinite(requestedMapStage) ? requestedMapStage : null;
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
    requestAnimationFrame(fitSequence);
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
  document.querySelectorAll("[data-agent-mode]").forEach((button) => {
    button.onclick = () => {
      state.agent.mode = button.dataset.agentMode === "llm" ? "llm" : "facts";
      document.querySelectorAll("[data-agent-mode]").forEach((item) => item.classList.toggle("active", item === button));
    };
  });
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
