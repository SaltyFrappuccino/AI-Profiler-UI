(function initReconstructionController(global) {
  "use strict";

  function create({
    state,
    getElement,
    request,
    esc,
    fmt,
    uniq,
    mappingViewUrl,
    download,
    loadSnapshots,
    showError,
    statuses,
    comparisonStatuses,
    gapDispositions,
  }) {
    const $ = getElement;
    const api = request;
    const RECONSTRUCTION_STATUS = statuses;
    const RECONSTRUCTION_COMPARISON_STATUS = comparisonStatuses;
    const RECONSTRUCTION_GAP_DISPOSITION = gapDispositions;

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

    return {
      payload: reconstructionPayload,
      expectedEdge: reconstructionExpectedEdge,
      status: reconstructionStatus,
      layerLabel: reconstructionLayerLabel,
      contractIds: reconstructionContractIds,
      sourceRefs: reconstructionSourceRefs,
      setMode: setReconstructionMode,
      exportProcess: exportReconstruction,
      renderView: renderReconstructionView,
      renderDetail: renderReconstructionDetail,
      renderStep: renderReconstructionStep,
      loadAiQueue: loadReconstructionAiQueue,
      runAiVerification: runReconstructionAiVerification,
      commitAiVerification: commitReconstructionAiVerification,
    };
  }

  global.AIProfilerReconstructionController = { create };
})(globalThis);