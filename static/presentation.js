(function initPresentation(global) {
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
  const hasNumericValue = (value) => value !== null && value !== "" && Number.isFinite(Number(value));
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
    open_external_dependency: `${fmt(process.unloadedDependencyCount || 0)} ${pluralRu(process.unloadedDependencyCount, "выход", "выхода", "выходов")} в незагруженные сервисы`,
    internal_gap: `${fmt(process.internalGapCount || 0)} ${pluralRu(process.internalGapCount, "внутренний разрыв", "внутренних разрыва", "внутренних разрывов")}`,
    incoming_context_gap: "не собран путь входящего отправителя",
    unknown_gap: `${fmt(process.unknownGapCount || 0)} ${pluralRu(process.unknownGapCount, "неразобранный выход", "неразобранных выхода", "неразобранных выходов")}`,
  }[process.closureStatus] || (process.assemblyComplete === false ? "есть незакрытые выходы" : "наблюдаемые границы замкнуты"));
  const mappingDirectionsLabel = (mapping = {}) => {
    const directions = mapping.directions || [];
    if (directions.includes("request") && directions.includes("response")) return "запрос и синхронный ответ";
    if (directions.includes("response")) return "синхронный ответ";
    return "запрос";
  };

  global.AIProfilerPresentation = {
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
  };
})(globalThis);
