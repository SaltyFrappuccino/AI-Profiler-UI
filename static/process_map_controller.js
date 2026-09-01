(function initProcessMapController(global) {
  "use strict";

  function create({
    state,
    getElement,
    esc,
    fmt,
    pluralRu,
    uniq,
    hasNumericValue,
    processNarrativeSummary,
    processClosureLabel,
    transportLabel,
    tierText,
    focusProcess,
    renderSequenceView,
    renderSequenceDetail,
    bindSequenceCanvasInteractions,
    fitSequence,
    setInspectorTab,
    updateAgentContext,
  }) {
    const $ = getElement;

function setProcessMapView(mode, stage = state.sequence.mapStage) {
  const next = ["overview", "stage", "diagnostic"].includes(mode) ? mode : "overview";
  state.sequence.mapView = next;
  if (next === "stage" && hasNumericValue(stage)) {
    state.sequence.mapStage = Number(stage);
    state.sequence.selectedStage = Number(stage);
  } else if (next !== "stage") {
    state.sequence.selectedStage = null;
  }
  state.sequence.selectedId = "";
  state.sequence.selectedRegionId = "";
  state.sequence.selectedRelationId = "";
  const params = new URLSearchParams(window.location.search);
  if (next === "overview") params.delete("mapView");
  else params.set("mapView", next);
  if (next === "stage" && hasNumericValue(state.sequence.mapStage)) params.set("mapStage", state.sequence.mapStage);
  else params.delete("mapStage");
  params.delete("step");
  window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  renderSequenceView();
  requestAnimationFrame(() => fitSequence({ readable: true }));
}

function setProcessMapFlow(flow) {
  state.sequence.mapFlow = ["all", "main", "conditional", "async", "exception"].includes(flow) ? flow : "all";
  state.sequence.selectedId = "";
  state.sequence.selectedRegionId = "";
  state.sequence.selectedRelationId = "";
  const params = new URLSearchParams(window.location.search);
  if (state.sequence.mapFlow === "all") params.delete("mapFlow");
  else params.set("mapFlow", state.sequence.mapFlow);
  params.delete("step");
  window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  renderSequenceView();
  requestAnimationFrame(() => fitSequence({ readable: true }));
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
  if (call.isStageSummary) {
    const counts = call.flowCounts || {};
    const flowRows = [
      ["main", "основной", counts.main],
      ["conditional", "условные", counts.conditional],
      ["async", "асинхронные", counts.async],
      ["exception", "аварийные", counts.exception],
      ["registry", "внешний контур", counts.registry],
    ].filter(([, , value]) => Number(value || 0) > 0)
      .map(([kind, label, value]) => `<span class="kind-${kind}"><b>${fmt(value)}</b>${label}</span>`)
      .join("");
    return `
      <button type="button" class="process-map-node process-map-stage-summary ${call.isRegistryBoundary ? "registry-boundary" : ""}"
        data-stage-summary="${esc(call.stageRef)}" style="left:${call.processMap.x}px;top:${call.processMap.y}px;width:${call.processMap.width}px;height:${call.processMap.height}px">
        <span class="process-map-node-head">
          <b>${esc(call.stageLabel || `Этап ${call.stageRef}`)}</b>
          <span>${fmt(call.uniqueOperationCount)} ${pluralRu(call.uniqueOperationCount, "уникальная операция", "уникальные операции", "уникальных операций")}</span>
        </span>
        <strong>${esc(call.payload)}</strong>
        <span class="process-map-stage-summary-meta">${fmt(call.occurrenceCount)} ${pluralRu(call.occurrenceCount, "появление", "появления", "появлений")} в статических путях · ${fmt(call.services?.length)} ${pluralRu(call.services?.length, "сервис", "сервиса", "сервисов")}</span>
        <span class="process-map-stage-summary-flows">${flowRows || "<span><b>0</b>действий</span>"}</span>
        <span class="process-map-stage-summary-action">Открыть этап <i>→</i></span>
      </button>`;
  }
  if (call.isStageContextSummary) {
    const direction = call.contextDirection === "incoming" ? "Контекст до этапа" : "Продолжение после этапа";
    return `
      <button type="button" class="process-map-node process-map-stage-context ${call.isRegistryBoundary ? "registry-boundary" : ""}"
        data-stage-summary="${esc(call.stageRef)}" style="left:${call.processMap.x}px;top:${call.processMap.y}px;width:${call.processMap.width}px;height:${call.processMap.height}px">
        <span class="process-map-context-kicker">${esc(direction)}</span>
        <strong>${esc(call.stageLabel)}</strong>
        <span>${fmt(call.uniqueOperationCount)} ${pluralRu(call.uniqueOperationCount, "операция", "операции", "операций")} · ${fmt(call.occurrenceCount)} ${pluralRu(call.occurrenceCount, "появление", "появления", "появлений")}</span>
        <span class="process-map-context-services">${fmt(call.services?.length)} ${pluralRu(call.services?.length, "сервис", "сервиса", "сервисов")}</span>
        <span class="process-map-stage-summary-action">Открыть соседний этап <i>→</i></span>
      </button>`;
  }
  if (call.isRegistryBoundary) {
    const boundary = call.registryBoundary || {};
    const inbound = boundary.direction === "inbound";
    const evidence = boundary.evidenceStatus === "code_boundary_and_registry"
      ? "кодовая граница + Excel"
      : "ожидаемый вход по Excel";
    return `
      <button type="button" class="process-map-node registry-boundary ${selected}"
        data-call-id="${esc(call.id)}" style="left:${call.processMap.x}px;top:${call.processMap.y}px;width:${call.processMap.width}px;height:${call.processMap.height}px">
        <span class="process-map-node-head">
          <b>${inbound ? "Вход" : "Внешняя граница"}</b>
          <span>${esc(call.sourceLabel)} → ${esc(call.targetLabel)}</span>
        </span>
        <strong>${esc(call.payload)}</strong>
        <span class="process-map-node-meta">архитектурный реестр · ${esc(evidence)}</span>
        <span class="process-map-execution kind-registry">${inbound ? "до точки входа процесса" : "точная позиция в сценарии не доказана"}</span>
        <span class="process-map-purpose"><i>Бизнес-контур</i>${esc((boundary.businessNames || [])[0] || "Ожидаемое взаимодействие из архитектурного Excel")}</span>
        <span class="process-map-node-badges">
          <em>${fmt((boundary.registryRowIds || []).length)} строк Excel</em>
          <em>${boundary.routeId ? "граница найдена в коде" : "внешний отправитель не загружен"}</em>
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
  const flowKind = call.flowKind || "main";
  const stepLabel = call.displayStepLabel || String(call.displayStep || call.order?.step || "?");
  const conditionHtml = call.guardSummary
    ? `<span class="process-map-condition" title="${esc((call.guardConditions || []).map((item) => `${item.branch === "else" ? "иначе" : "если"} ${item.condition}`).join("; "))}"><i>◇</i>${esc(call.guardSummary)}</span>`
    : "";
  return `
    <button type="button" class="process-map-node tier-${esc(call.tier)} flow-${esc(flowKind)} ${call.isContext ? "context" : ""} ${selected}"
      data-call-id="${esc(call.id)}" style="left:${map.x}px;top:${map.y}px;width:${map.width}px;height:${map.height}px">
      <span class="process-map-node-head">
        <b>${call.isContext ? "Контекст" : "Шаг"} ${esc(stepLabel)}</b>
        <span>${esc(call.sourceLabel)} → ${esc(call.targetLabel)}</span>
      </span>
      <strong>${esc(call.payload)}</strong>
      <span class="process-map-node-meta">${esc(transportLabel(call.transport))} · ${synchronous ? "запрос + синхронный ответ" : "передача вперёд"}</span>
      <span class="process-map-execution kind-${esc(flowKind)}">${esc(call.executionLabel || "порядок не доказан")}</span>
      ${conditionHtml}
      <span class="process-map-purpose"><i>${purposeLabel}</i>${esc(purpose)}</span>
      <span class="process-map-node-badges">
        ${Number(call.occurrenceCount || 0) > 1 ? `<em>${fmt(call.occurrenceCount)} появлений</em>` : ""}
        <em>${fmt(call.fieldCount)} связей полей</em>
        <em>${call.order?.readiness ? `готовность ${fmt(call.order.readiness.score)}/100` : esc(tierText(call.tier))}</em>
      </span>
    </button>`;
}

function processMapGatewayHtml(region) {
  if (region.renderGateway === false) return "";
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
  if (!["async_task", "parallel", "exception"].includes(region.kind) || !region.bounds) return "";
  const selected = region.id === state.sequence.selectedRegionId ? "selected" : "";
  return `<button type="button" class="process-map-region-frame kind-${esc(region.kind)} ${selected}"
    data-region-id="${esc(region.id)}" title="Открыть состав подпроцесса"
    style="left:${region.bounds.x}px;top:${region.bounds.y}px;width:${region.bounds.width}px;height:${region.bounds.height}px">
      <span>${esc(region.frameLabel || region.label)}</span>
    </button>`;
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
      ? "Ромб показывает взаимоисключающие ветки условия. Подписи у выходов содержат проверку, по которой выбирается ветка."
      : region.kind === "parallel"
        ? "Этот блок запускает несколько веток параллельно. Порядок их завершения не утверждается."
        : region.kind === "async_task"
          ? "Рамка показывает отдельный асинхронный подпроцесс. Он запускается из исходного потока, но дальше имеет собственный порядок выполнения."
          : region.kind === "exception"
            ? "Это обработка исключения или аварийная ветка исходного кода."
            : "Этот участок кода может повторять вложенные действия."}</p>
    <div class="kv">
      <span>Условие</span><b>${esc(processMapValue(region.condition || region.guard))}</b>
      <span>Смысл области</span><b>${esc(region.scopeLabel || "управление потоком")}</b>
      <span>Метод-владелец</span><b>${esc(processMapValue(region.ownerMethodId || region.ownerMethod || region.methodId))}</b>
      <span>Файл / строка</span><b>${esc(sourceLocation)}</b>
      ${Number(region.conditionOccurrenceCount || 0) > 1
        ? `<span>Повтор условия</span><b>${fmt(region.conditionOccurrenceCount)} независимых проверок в строках ${(region.conditionSourceLines || []).map(fmt).join(", ")}</b>`
        : ""}
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
      ? "Пунктир присоединяет ожидаемую бизнес-границу из Excel к ближайшей доказанной точке кода. Это не доказанный следующий runtime-шаг: без найденного исходящего вызова нельзя утверждать, что внешнее продолжение начинается сразу после этой карточки."
      : relation.kind === "async_handoff"
        ? "Сообщение или задача передаётся в новый поток выполнения. Пунктир не означает синхронный вызов и не обещает немедленный старт получателя."
        : relation.kind === "async_spawn"
          ? "Код запускает отдельную асинхронную задачу. Между блоками доказан запуск, но не общий стек вызовов."
          : relation.kind === "parallel_join"
            ? "Продолжение начинается после точки объединения параллельных ветвей. Порядок завершения самих ветвей не задаётся."
            : relation.kind === "completion_callback"
              ? "Это callback завершения асинхронной операции. Он срабатывает после результата или ошибки, а не как обычный следующий вызов."
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
      ? "Подпись «ожидается у шага N · Excel» означает точку сопоставления с реестром, а не установленный порядок исполнения. Нажмите на пунктирный прямоугольник, чтобы увидеть строки Excel и наличие или отсутствие кодовой границы."
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
      <span>Порядок</span><b>${codeBacked ? "граница найдена; позиция относительно шагов не доказана" : "до точки входа; задан направлением Excel"}</b>
    </div>
    <div class="detail-section"><h3>Как взаимодействие называется в Excel</h3><ul class="process-map-branch-list">${names || "<li>Название не заполнено.</li>"}</ul></div>
    <div class="detail-section"><h3>Точки взаимодействия</h3><div class="chips">${points || "<span>не заполнены</span>"}</div></div>
    <div class="detail-section"><h3>Ссылки на архитектурный реестр</h3><ul class="process-map-branch-list">${refs || "<li>Ссылка на строку не сохранена.</li>"}</ul></div>
    <p class="muted">Внешние карточки образуют отдельный контур, как участники вне pool в BPMN. Они не соединяются со случайным внутренним шагом, пока анализатор не докажет относительный порядок по control flow.</p>`;
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
    ? `${sourceServices[0]} выполняет действия к сервисам ${targetServices.join(", ")}; на карте показано ${fmt(facts.calls.length)} вхождений в пути исполнения.`
    : `Этап связывает сервисы ${facts.services.join(", ")}; на карте показано ${fmt(facts.calls.length)} вхождений в пути исполнения.`;
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
      <small>${esc(call.executionLabel || call.payload || "позиция не доказана")}</small>
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
      if (state.sequence.mapView !== "stage") params.delete("mapStage");
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

function renderProcessOverviewDetail(process, layout) {
  const stages = layout.stages || [];
  const summary = process.processIr?.summary || {};
  const sourceCallCount = Number(layout.overviewSourceCallCount || 0);
  const visibleOperations = layout.calls.reduce((sum, call) => sum + Number(call.uniqueOperationCount || 0), 0);
  const filtered = state.sequence.mapFlow !== "all";
  $("sequence-detail").innerHTML = `
    <span class="detail-kicker">ОБЗОР ПРОЦЕССА</span>
    <h3>${esc(process.name)}</h3>
    <p>Каждая карточка представляет этап, а не отдельный вызов. Она объединяет повторные появления одной операции в альтернативных статических путях. Нажмите на этап, чтобы открыть его локальный граф.</p>
    <div class="kv">
      <span>Этапов</span><b>${fmt(stages.length)}</b>
      <span>Уникальных операций</span><b>${fmt(visibleOperations)}</b>
      <span>Появлений в путях</span><b>${fmt(sourceCallCount)}</b>
      <span>Активный срез путей</span><b>${esc(window.AIProfilerProcessMapPresentation?.flowLabel(state.sequence.mapFlow) || "Все пути")}</b>
      <span>Развилок</span><b>${fmt(summary.choiceRegionCount || 0)}</b>
      <span>Асинхронных задач</span><b>${fmt(summary.asyncTaskRegionCount || 0)}</b>
      <span>Параллельных блоков</span><b>${fmt(summary.parallelRegionCount || 0)}</b>
      <span>Без доказанной позиции</span><b>${fmt(summary.unsequencedNodeCount || 0)}</b>
    </div>
    ${filtered ? `<p class="process-map-filter-note">Сейчас показан только срез «${esc(window.AIProfilerProcessMapPresentation?.flowLabel(state.sequence.mapFlow))}». Остальные доказанные пути не удалены и доступны через фильтр над картой.</p>` : ""}
    <div class="detail-section">
      <h3>Как читать обзор</h3>
      <ol class="process-map-reading-list">
        <li>Идите по этапам слева направо.</li>
        <li>Цветные счётчики показывают основной, условный, асинхронный и аварийный состав этапа.</li>
        <li>Одна линия между этапами агрегирует одинаковые доказанные переходы.</li>
        <li>Для технической проверки переключитесь в «Технический граф».</li>
      </ol>
    </div>`;
}

function processMapControlsHtml(layout) {
  const mode = state.sequence.mapView;
  const flow = state.sequence.mapFlow;
  const stageSelected = hasNumericValue(state.sequence.mapStage);
  const modeButton = (value, label) => `<button type="button" data-map-view="${value}" class="${mode === value ? "active" : ""}" ${value === "stage" && !stageSelected ? "disabled" : ""}>${label}</button>`;
  const flowButton = (value, label) => `<button type="button" data-map-flow="${value}" class="kind-${value} ${flow === value ? "active" : ""}">${label}</button>`;
  return `
    <div class="process-map-controls" aria-label="Уровень детализации карты">
      <div class="process-map-control-group">
        <span>Представление</span>
        <div class="process-map-segmented">
          ${modeButton("overview", "Обзор")}
          ${modeButton("stage", stageSelected ? `Этап ${fmt(state.sequence.mapStage)}` : "Этап")}
          ${modeButton("diagnostic", "Технический граф")}
        </div>
      </div>
      <div class="process-map-control-group flow-filter">
        <span>Пути</span>
        <div class="process-map-flow-filters">
          ${flowButton("all", "Все")}
          ${flowButton("main", "Основной")}
          ${flowButton("conditional", "Условные")}
          ${flowButton("async", "Асинхронные")}
          ${flowButton("exception", "Аварийные")}
        </div>
      </div>
      <p>${layout.viewMode === "overview"
        ? "Сводка без повторов: этапы раскрываются по клику."
        : layout.viewMode === "stage"
          ? "Показан выбранный этап и только его непосредственный контекст."
          : "Диагностический режим: все статические появления и переходы."}</p>
    </div>`;
}

function processMapLegendHtml(layout) {
  const task = `<span><i class="legend-task"></i>${layout.viewMode === "overview" ? "этап процесса" : "действие сервиса"}</span>`;
  const relation = `<span title="Линию можно выбрать и открыть её основание"><i class="legend-flow"></i>${layout.viewMode === "overview" ? "агрегированный переход" : "доказанный переход"}</span>`;
  const registry = `<span title="Внешний участник известен из Excel, но его позиция показывается только при доказанном control flow"><i class="legend-registry"></i>внешний контур · порядок отдельно</span>`;
  const context = `<span><i class="legend-context"></i>свёрнутый соседний этап</span>`;
  const condition = `<span><i class="legend-condition"></i>условие выполнения</span>`;
  const asyncFlow = `<span><i class="legend-async"></i>передача в другой поток</span>`;
  const exception = `<span><i class="legend-error-region"></i>только при ошибке</span>`;
  const items = layout.viewMode === "overview"
    ? [task, relation, registry]
    : layout.viewMode === "stage"
      ? [task, context, condition, asyncFlow, exception, relation, registry]
      : [
          task,
          `<span><i class="legend-gateway"></i>развилка / объединение</span>`,
          condition,
          `<span><i class="legend-async-region"></i>асинхронный подпроцесс</span>`,
          exception,
          relation,
          asyncFlow,
          registry,
          `<span title="ИИ-текст показывается только при наличии сохранённых оснований">Зачем (ИИ) / Почему здесь</span>`,
        ];
  return `<div class="process-map-legend mode-${esc(layout.viewMode || "diagnostic")}">${items.join("")}</div>`;
}

function renderProcessMapDetail(layout, process) {
  if (layout.viewMode === "overview") {
    renderProcessOverviewDetail(process, layout);
    return;
  }
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
  const fullLayout = window.AIProfilerProcessMap?.build(activeProcess, sequenceData.calls);
  const layout = window.AIProfilerProcessMapPresentation?.build(fullLayout, {
    viewMode: state.sequence.mapView,
    flowFilter: state.sequence.mapFlow,
    selectedStage: state.sequence.mapStage,
  }) || fullLayout;
  state.sequence.processMapData = layout;
  const mapCanvas = $("sequence-canvas");
  mapCanvas?.classList.remove("map-view-overview", "map-view-stage", "map-view-diagnostic");
  mapCanvas?.classList.add(`map-view-${layout?.viewMode || "diagnostic"}`);
  if (!layout?.calls?.length) {
    $("sequence-canvas").innerHTML = `${processMapControlsHtml(layout || {})}<div class="empty process-map-filter-empty">В выбранном этапе нет путей типа «${esc(window.AIProfilerProcessMapPresentation?.flowLabel(state.sequence.mapFlow) || state.sequence.mapFlow)}». Выберите другой тип пути или вернитесь к обзору.</div>`;
    $("sequence-detail").innerHTML = `<div class="empty">Фильтр представления ничего не нашёл. Исходный технический граф и доказательства не изменены.</div>`;
    bindSequenceCanvasInteractions();
    return;
  }
  if (layout.viewMode === "stage" && Number.isFinite(Number(layout.selectedStage))) {
    state.sequence.mapStage = Number(layout.selectedStage);
  }
  if (!layout.stages.some((stage) => Number(stage.stage) === Number(state.sequence.selectedStage))) {
    state.sequence.selectedStage = null;
  }
  if (layout.viewMode === "overview") {
    state.sequence.selectedId = "";
    state.sequence.selectedStage = null;
  } else if (state.sequence.selectedStage) {
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
    if (relation.renderMode === "registry_reference") return "";
    const route = window.AIProfilerProcessMap.edgeRoute(from, to, relation);
    const path = route.path;
    const selected = relation.id === state.sequence.selectedRelationId ? "selected" : "";
    const routeLabelWidth = Number(relation.routeLabelWidth || 47);
    const routeLabel = relation.showRouteLabel
      ? `<g class="process-map-edge-label ${relation.kind === "registry_context" ? "registry" : ""}" transform="translate(${route.labelX} ${route.labelY})">
          <rect x="-3" y="-12" width="${routeLabelWidth}" height="18" rx="4"></rect>
          <text x="4" y="1">${esc(relation.routeLabel)}</text>
        </g>`
      : "";
    return `<g class="process-map-relation ${esc(relation.cssClass)} ${selected}">
      <path class="process-map-edge" d="${path}" marker-end="url(#process-arrow)" />
      <path class="process-map-edge-hit" data-relation-id="${esc(relation.id)}" d="${path}"><title>${esc(relation.label)}</title></path>
      ${Number.isFinite(route.startX) ? `<circle class="process-map-port source" cx="${route.startX}" cy="${route.startY}" r="3"></circle>` : ""}
      ${Number.isFinite(route.endX) ? `<circle class="process-map-port target" cx="${route.endX}" cy="${route.endY}" r="3"></circle>` : ""}
      ${routeLabel}
    </g>`;
  }).join("");
  const controlSvg = layout.regions.flatMap((region) => region.links.map((link) => {
    const target = layout.callById.get(link.targetCallId);
    if (!target) return "";
    const width = Math.min(176, Math.max(54, String(link.label || "ветка").length * 5.6 + 14));
    const route = window.AIProfilerProcessMap.controlRoute(region, target, { ...link, labelWidth: width });
    return `<g class="process-map-control-group kind-${esc(region.kind)}">
      <path class="process-map-control-link kind-${esc(region.kind)}" d="${route.path}"><title>${esc(region.label)} · ${esc(link.label)}</title></path>
      <g class="process-map-control-label" transform="translate(${route.labelX} ${route.labelY})">
        <rect x="0" y="-12" width="${width}" height="18" rx="4"></rect>
        <text x="6" y="1">${esc(link.label || "ветка")}</text>
      </g>
    </g>`;
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
    ${processMapControlsHtml(layout)}
    <div class="process-map-notice ${layout.runtimeTraceSafe ? "trace-safe" : "path-union"}">
      <b>${layout.viewMode === "overview" ? "Обзор этапов" : layout.viewMode === "stage" ? `Локальный граф этапа ${fmt(layout.selectedStage)}` : (layout.runtimeTraceSafe ? "Карта ограничений исполнения" : "Все статические маршруты")}</b>
      <span>${layout.viewMode === "overview"
        ? `${fmt(layout.overviewSourceCallCount)} появлений операций агрегированы в ${fmt(layout.calls.length)} этапов.`
        : layout.viewMode === "stage"
          ? `Повторные операции схлопнуты; ${fmt(layout.contextOccurrenceCount)} соседних действий сведены в ${fmt(layout.contextualStageCount)} контекстных узлов.${layout.groupedOccurrenceCount ? ` Скрыто повторов выбранного этапа: ${fmt(layout.groupedOccurrenceCount)}.` : ""}`
          : layout.runtimeTraceSafe
            ? "Линии показывают доказанные зависимости; параллельные ветки не сортируются по времени завершения."
            : "Диагностическая схема объединяет альтернативные статические маршруты и не выдаёт их за один production-запуск."}</span>
      ${layout.unsequencedCount ? `<em>${fmt(layout.unsequencedCount)} блоков без доказанной позиции</em>` : ""}
    </div>
    ${processMapLegendHtml(layout)}
    <div class="process-map-stage" style="width:${layout.width * zoom}px;height:${layout.height * zoom}px">
      <div class="process-map-world" style="width:${layout.width}px;height:${layout.height}px;transform:scale(${zoom})">
        ${layout.stages.map((stage) => `<div class="process-map-stage-band ${stage.isRegistryBoundary ? "registry-boundary" : ""} ${stage.selected ? "selected" : ""}" style="left:${stage.x}px;width:${stage.width}px"></div>`).join("")}
        ${layout.stages.map((stage) => `<button type="button" class="process-map-stage-header ${stage.isRegistryBoundary ? "registry-boundary" : ""} ${stage.selected || Number(stage.stage) === Number(state.sequence.selectedStage) ? "selected" : ""}" data-map-stage="${fmt(stage.stage)}" style="left:${stage.x + 8}px;width:${Math.max(150, stage.width - 16)}px" title="Открыть разбор ${esc(stage.label || `этапа ${stage.stage}`)}"><b>${esc(stage.label || `Этап ${stage.stage}`)}</b><span>${esc(stage.callCountLabel || `${fmt(stage.callCount)} ${pluralRu(stage.callCount, "действие", "действия", "действий")}`)} · ${esc(stage.executionSummary || "порядок по коду")}</span></button>`).join("")}
        ${layout.regions.map(processMapRegionFrameHtml).join("")}
        <svg class="process-map-svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" aria-label="Связи карты процесса">
          <defs><marker id="process-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" /></marker></defs>
          ${startEdges}${edgeSvg}${endEdges}${controlSvg}
        </svg>
        <div class="process-map-event start" style="left:${layout.start.x - 16}px;top:${layout.start.y - 16}px" title="Точка входа процесса"><span>Старт</span></div>
        ${endPoints.map((point) => `<div class="process-map-event ${point.kind === "external_boundary" ? "external-boundary" : point.kind === "exception_end" ? "exception-end" : "end"}" style="left:${point.x - 16}px;top:${point.y - 16}px" title="${point.kind === "external_boundary" ? "Продолжение уходит за границу загруженного кода" : point.kind === "exception_end" ? "Аварийная ветка завершается после обработки исключения" : "Наблюдаемый конец этой ветки"}"><span>${esc(point.label)}</span></div>`).join("")}
        ${layout.calls.map(processMapNodeHtml).join("")}
        ${layout.regions.map(processMapGatewayHtml).join("")}
      </div>
    </div>`;
  bindSequenceCanvasInteractions();
  renderProcessMapDetail(layout, activeProcess);
}

    return {
      setView: setProcessMapView,
      setFlow: setProcessMapFlow,
      updateModeControls: updateDiagramModeControls,
      value: processMapValue,
      stageFacts: processMapStageFacts,
      renderView: renderProcessMapView,
      renderDetail: renderProcessMapDetail,
      renderChooser: renderProcessMapChooser,
    };
  }

  global.AIProfilerProcessMapController = { create };
})(globalThis);