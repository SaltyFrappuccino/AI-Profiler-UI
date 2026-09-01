(function initMappingView(global) {
  function buildRows(graph = {}, options = {}, helpers = {}) {
    const presentation = global.AIProfilerPresentation;
    const serviceName = helpers.serviceName || ((value) => String(value || ""));
    const strictContract = helpers.strictContract || ((contract) => contract?.confirmed === true);
    const linksByContract = new Map();
    for (const link of graph.contractFieldLinks || []) {
      const id = String(link.contractId || "");
      linksByContract.set(id, [...(linksByContract.get(id) || []), link]);
    }
    const query = String(options.filter || "").trim().toLowerCase();
    return (graph.contracts || []).map((contract) => {
      const links = linksByContract.get(contract.contractId) || [];
      const confirmedLinks = links.filter((link) => link.confirmed === true);
      const mapping = presentation.contractMapping(contract);
      const requestSource = (mapping.requestSourcePayloadTypes || []).join(", ");
      const requestTarget = (mapping.requestTargetPayloadTypes || []).join(", ");
      const payload = (contract.sharedPayloadTypes || []).join(", ")
        || [requestSource, requestTarget].filter(Boolean).join(" → ");
      const strict = contract.confirmed === true || strictContract(contract);
      return {
        id: contract.contractId,
        contract,
        links,
        confirmedLinks,
        strict,
        sourceLabel: serviceName(contract.sourceService),
        targetLabel: serviceName(contract.targetService),
        payload,
        xlsx: mapping.href || "",
        csv: mapping.csvHref || "",
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
    })
      .filter((row) => !options.confidentOnly || row.strict)
      .filter((row) => !query || row.searchText.includes(query))
      .sort((a, b) => Number(b.strict) - Number(a.strict)
        || b.confirmedLinks.length - a.confirmedLinks.length
        || a.sourceLabel.localeCompare(b.sourceLabel));
  }

  function summary(graph = {}, rows = [], helpers = {}) {
    const presentation = global.AIProfilerPresentation;
    const strictContract = helpers.strictContract || ((contract) => contract?.confirmed === true);
    const allContracts = graph.contracts || [];
    const allLinks = graph.contractFieldLinks || [];
    const mappedContracts = allContracts.filter((contract) => Boolean(presentation.contractMapping(contract).href));
    return [
      `${presentation.fmt(rows.length)} показано`,
      `${presentation.fmt(mappedContracts.length)}/${presentation.fmt(allContracts.length)} имеют Excel · ${presentation.fmt(mappedContracts.filter((contract) => presentation.contractMapping(contract).status === "complete").length)} пополевые полные`,
      `${presentation.fmt(mappedContracts.filter((contract) => (presentation.contractMapping(contract).directions || []).includes("response")).length)} содержат доказанный ответ`,
      `${presentation.fmt(allContracts.filter((contract) => contract.confirmed === true || strictContract(contract)).length)} уверенных`,
      `${presentation.fmt(allLinks.filter((link) => link.confirmed === true).length)}/${presentation.fmt(allLinks.length)} пополевых путей подтверждено`,
    ].join(" · ");
  }

  function rowHtml(row, selectedId) {
    const { esc, fmt, mappingCoverageLabel, contractMapping } = global.AIProfilerPresentation;
    const labels = global.AIProfilerLabels;
    const contract = row.contract;
    const mapping = contractMapping(contract);
    const claimStatus = contract.evidenceClaim?.status || "";
    return `
      <tr class="${row.id === selectedId ? "selected" : ""}" data-mapping-id="${esc(row.id)}">
        <td><b>${esc(row.sourceLabel)} → ${esc(row.targetLabel)}</b><div class="mono">${esc(contract.transport || "")}</div></td>
        <td>${esc(row.payload || "payload не раскрыт")}<div class="muted">${esc(mappingCoverageLabel(mapping))}</div></td>
        <td>${fmt(contract.sharedFieldCount)} общих · ${fmt(row.confirmedLinks.length)} путей подтверждено</td>
        <td>${esc(labels.contractProof(contract.proofLevel))}<div class="muted">${row.strict ? "уверенный" : "требует проверки"}${claimStatus ? ` · ${esc(labels.claimStatus(claimStatus))}` : ""}</div></td>
        <td>${esc(labels.qualityTier(contract.qualityTier || contract.proofLevel || contract.status))}<div class="muted">${fmt(contract.targetSourceRefCount)} мест в коде</div></td>
      </tr>
    `;
  }

  function tableHtml(rows, selectedId) {
    return `
      <thead><tr><th>Маршрут</th><th>Excel-маппинг</th><th>Поля</th><th>Доказательство</th><th>Качество</th></tr></thead>
      <tbody>${rows.map((row) => rowHtml(row, selectedId)).join("") || `<tr><td colspan="5" class="empty">Маппинги не найдены под текущий фильтр.</td></tr>`}</tbody>
    `;
  }

  function csvPreviewHtml(row, preview, previewFor) {
    const { esc, fmt } = global.AIProfilerPresentation;
    if (previewFor !== row.id || !preview) return "";
    if (preview.error) {
      return `<div class="detail-section"><h3>CSV preview</h3><p class="muted">${esc(preview.error)}</p></div>`;
    }
    const columns = preview.columns || [];
    const rows = preview.rows || [];
    return `
      <div class="detail-section">
        <h3>CSV preview</h3>
        <p class="muted">${esc(preview.path || row.csv)} · ${fmt(rows.length)} строк загружено</p>
        <div class="mapping-preview"><table class="table">
          <thead><tr>${columns.map((column) => `<th>${esc(column)}</th>`).join("")}</tr></thead>
          <tbody>${rows.slice(0, 80).map((item) => `<tr>${columns.map((column) => `<td>${esc(item[column] || "")}</td>`).join("")}</tr>`).join("")}</tbody>
        </table></div>
      </div>
    `;
  }

  function detailHtml(row, options = {}) {
    const { esc, fmt, mappingCoverageLabel, mappingDirectionsLabel, contractMapping } = global.AIProfilerPresentation;
    const labels = global.AIProfilerLabels;
    const contract = row.contract;
    const mapping = contractMapping(contract);
    const composition = mapping.compositionSummary || {};
    const chips = (fields) => (fields || []).slice(0, 80)
      .map((field) => `<span class="field-chip">${esc(field)}</span>`).join("");
    const sourceFields = chips(contract.sourceContractFields);
    const targetFields = chips(contract.targetContractFields);
    const linkRows = row.links.slice(0, 160).map((link) => `
      <tr>
        <td><b>${esc(link.field || "")}</b><div class="muted">${link.confirmed ? "подтверждено" : "требует проверки"}</div></td>
        <td class="mono">${esc((link.sourcePaths || []).join(", "))}</td>
        <td class="mono">${esc((link.targetPaths || []).join(", "))}</td>
        <td>${esc(labels.contractProof(link.proofLevel))}</td>
      </tr>
    `).join("");
    const fileUrl = options.fileUrl || ((value) => value);
    return `
      <h3>${esc(row.sourceLabel)} → ${esc(row.targetLabel)}</h3>
      <p class="muted">${esc(contract.proofLevel || "")} · ${esc(contract.transport || "")}</p>
      <div class="kv">
        <span>Payload</span><b>${esc(row.payload || "—")}</b>
        <span>Полнота Excel</span><b>${esc(mappingCoverageLabel(mapping))}</b>
        <span>Направления в Excel</span><b>${esc(mappingDirectionsLabel(mapping))}</b>
        <span>Цепочка DTO → transport → DTO</span><b>${fmt(composition.completeRowCount)} полных · ${fmt(composition.partialRowCount)} с разрывом</b>
        <span>Продолжения после ресивера</span><b>${fmt(composition.receiverContinuationCount)}</b>
        <span>Продолжения ответа у caller-а</span><b>${fmt(composition.responseContinuationCount)}</b>
        <span>Связь подтверждена</span><b>${row.strict ? "да" : "нет"}</b>
        <span>Итог проверки</span><b>${esc(labels.claimStatus(contract.evidenceClaim?.status))}</b>
        <span>Пополевые пути</span><b>${fmt(row.confirmedLinks.length)} / ${fmt(row.links.length)} подтверждено</b>
        <span>Уровень доказательства</span><b>${esc(labels.qualityTier(contract.qualityTier || contract.proofLevel || contract.status))}</b>
        <span>Технический ID</span><span class="mono">${esc(contract.contractId)}</span>
      </div>
      <div class="mapping-actions">
        ${row.xlsx ? `<a class="mini-btn" href="${fileUrl(row.xlsx)}" target="_blank" rel="noreferrer">Открыть XLSX</a>` : ""}
        ${row.csv ? `<button class="mini-btn" type="button" id="mapping-load-csv">Показать CSV</button>` : ""}
      </div>
      <div class="detail-section"><h3>Поля модели отправителя</h3><div class="field-list">${sourceFields || `<span class="muted">Не раскрыты.</span>`}</div></div>
      <div class="detail-section"><h3>Поля модели получателя</h3><div class="field-list">${targetFields || `<span class="muted">Не раскрыты.</span>`}</div></div>
      <div class="detail-section">
        <h3>Пополевый маппинг</h3>
        <div class="mapping-preview"><table class="table">
          <thead><tr><th>Поле</th><th>Путь у отправителя</th><th>Путь у получателя</th><th>Доказательство</th></tr></thead>
          <tbody>${linkRows || `<tr><td colspan="4" class="muted">Пополевые пути не записаны.</td></tr>`}</tbody>
        </table></div>
      </div>
      ${csvPreviewHtml(row, options.csvPreview, options.csvPreviewFor)}
    `;
  }

  global.AIProfilerMappingView = {
    buildRows,
    csvPreviewHtml,
    detailHtml,
    rowHtml,
    summary,
    tableHtml,
  };
})(globalThis);
