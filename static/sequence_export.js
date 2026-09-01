globalThis.AIProfilerSequenceExport = (() => {
  function html(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function text(value, fallback = "—") {
    if (Array.isArray(value)) return value.filter(Boolean).join(", ") || fallback;
    return value === undefined || value === null || value === "" ? fallback : String(value);
  }

  function number(value) {
    return new Intl.NumberFormat("ru-RU").format(Number(value || 0));
  }

  function plural(value, one, few, many) {
    const count = Math.abs(Number(value || 0)) % 100;
    const last = count % 10;
    if (count > 10 && count < 20) return many;
    if (last === 1) return one;
    if (last >= 2 && last <= 4) return few;
    return many;
  }

  function list(values, empty = "Нет данных") {
    const items = (values || []).filter(Boolean);
    if (!items.length) return `<span class="empty">${html(empty)}</span>`;
    return `<div class="chips">${items.map((item) => `<span>${html(item)}</span>`).join("")}</div>`;
  }

  function mappingData(contract = {}) {
    return contract.mapping || contract.crossServiceDataSurf || contract.dataSurf || {};
  }

  function fieldJourneys(call) {
    const contract = call.contract || call.contracts?.[0] || {};
    const rows = (contract.sharedFieldDetails || []).flatMap((detail) => {
      const sources = detail.sourcePaths || [];
      const targets = detail.targetPaths || [];
      const count = Math.max(sources.length, targets.length, 1);
      return Array.from({ length: count }, (_, index) => `
        <tr>
          <td>${html(sources[index] || sources[0] || detail.field || "?")}</td>
          <td class="arrow">→</td>
          <td>${html(targets[index] || targets[0] || detail.field || "?")}</td>
          <td>${html(detail.field || "")}</td>
        </tr>`);
    });
    if (!rows.length) return `<p class="empty">Пополевой путь для этого вызова пока не восстановлен.</p>`;
    return `<div class="table-wrap"><table><thead><tr><th>Путь отправителя</th><th></th><th>Путь получателя</th><th>Поле</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
  }

  function citations(call) {
    const rows = call.order?.purposeCitations || [];
    if (!rows.length) return `<p class="empty">ИИ-объяснение не содержит проверяемых ссылок на факты.</p>`;
    return `<ul class="evidence">${rows.map((item) => `<li><code>${html(item.factId)}</code> ${html(item.evidence)}</li>`).join("")}</ul>`;
  }

  function dataSurf(call) {
    const contract = call.contract || call.contracts?.[0] || {};
    const data = mappingData(contract);
    const href = data.packageHref || data.href || data.file || "";
    if (!href) return `<p class="empty">Excel-маппинг именно для этой пары не найден. Доказательства из кода и схем всё равно показаны ниже.</p>`;
    const coverage = data.coverageStatus || data.coverage || "найден";
    const counts = data.schemaLeafCount
      ? `, покрыто ${number(data.mappedSchemaLeafCount)}/${number(data.schemaLeafCount)} листовых полей`
      : "";
    return `<p><b>${html(coverage)}</b>${html(counts)}</p>${data.packageHref
      ? `<p><a class="asset-link" href="${html(data.packageHref)}">Открыть Excel маппинга</a></p>`
      : `<p class="path">${html(href)}</p>`}`;
  }

  function architectureRegistry(call) {
    const contract = call.contract || call.contracts?.[0] || {};
    const refs = contract.architectureRegistryRefs || [];
    if (!refs.length) return `<p class="empty">Для этого контракта строка архитектурного реестра не сопоставлена.</p>`;
    return `${refs.map((ref) => `
      <article class="registry-ref">
        <p><b>${html(ref.interactionCode || "Строка реестра")}</b> · ${html(ref.name || "")}</p>
        <p>Направление бизнес-данных: <b>${html(text(ref.providerComponent, "?"))} → ${html(text(ref.consumerComponent, "?"))}</b>.</p>
        ${(ref.sourceRefs || []).map((source) => {
          const location = `${text(source.file, "файл не указан")} · ${text(source.sheet, "лист не указан")} · строка ${number(source.row)}`;
          return source.packageHref
            ? `<p><a class="asset-link" href="${html(source.packageHref)}">${html(location)}</a></p>`
            : `<p class="path">${html(location)}</p>`;
        }).join("")}
      </article>`).join("")}
      <p class="empty">Реестр показывает ожидаемую архитектурную связь. Без подтверждения кодом или конфигурацией он не повышает уровень доказательства.</p>`;
  }

  function routeSignature(call) {
    const ids = [...new Set((call.routeVariants || []).map((variant) => variant.routeId).filter(Boolean))].sort();
    return ids.length > 1 ? ids.join("|") : "";
  }

  function buildRouteFragments(calls) {
    const fragments = [];
    let start = 0;
    while (start < calls.length) {
      const signature = routeSignature(calls[start]);
      if (!signature) {
        start += 1;
        continue;
      }
      let end = start + 1;
      while (end < calls.length && routeSignature(calls[end]) === signature && calls[end]?.order?.processId === calls[start]?.order?.processId) end += 1;
      if (end - start >= 2) {
        const group = calls.slice(start, end);
        const routeIds = signature.split("|");
        const rawSteps = [...new Set(group.flatMap((call) => (call.routeVariants || []).map((variant) => Number(variant.rawStep || 0)).filter(Boolean)))].sort((left, right) => left - right);
        const kinds = new Set(group.flatMap((call) => call.processIr?.regionKinds || []));
        const allVariants = group.flatMap((call) => call.routeVariants || []);
        const controlKinds = new Set(allVariants.flatMap((variant) => [
          ...(variant.controlContext || []),
          ...(variant.inheritedControlContext || []),
          ...(variant.conditionalContext || []),
        ]).map((item) => typeof item === "string" ? item : item?.kind || item?.type || "").filter(Boolean));
        const semanticTags = [];
        if (kinds.has("choice") || kinds.has("guard") || allVariants.some((variant) => (variant.conditionalContext || []).length) || controlKinds.has("if") || controlKinds.has("switch")) semanticTags.push("opt");
        if (kinds.has("parallel") || kinds.has("async_task") || allVariants.some((variant) => variant.executionMode === "parallel" || variant.asyncKind || variant.parallelGroup)) semanticTags.push("par");
        if (kinds.has("loop") || allVariants.some((variant) => (variant.loopContext || []).length)) semanticTags.push("loop");
        if (kinds.has("exception") || allVariants.some((variant) => (variant.exceptionContext || []).length)) semanticTags.push("break");
        const minX = Math.min(...group.flatMap((call) => [call.x1, call.x2]));
        const maxX = Math.max(...group.flatMap((call) => [call.x1, call.x2]));
        const minY = Math.min(...group.map((call) => call.y));
        const maxY = Math.max(...group.map((call) => call.y));
        fragments.push({
          id: `ref:${group[0]?.order?.processId || "process"}:${group[0]?.id || "start"}:${routeIds.join(",")}`,
          kind: "ref",
          routeCount: routeIds.length,
          routeIds,
          callIds: group.map((call) => call.id),
          rawSteps,
          rawStepMin: rawSteps[0] || 0,
          rawStepMax: rawSteps.at(-1) || 0,
          hiddenOccurrenceCount: Math.max(0, group.reduce((sum, call) => sum + Number(call.variantCount || 1), 0) - group.length),
          semanticTags,
          variants: routeIds.map((routeId) => ({
            routeId,
            occurrences: group.flatMap((call) => (call.routeVariants || []).filter((variant) => variant.routeId === routeId).map((variant) => ({
              callId: call.id,
              sourceLabel: call.sourceLabel,
              targetLabel: call.targetLabel,
              rawStep: Number(variant.rawStep || 0),
              sourceFile: variant.sourceFile || "",
              sourceLine: Number(variant.sourceLine || 0),
              controlContext: variant.controlContext || [],
              inheritedControlContext: variant.inheritedControlContext || [],
              conditionalContext: variant.conditionalContext || [],
              loopContext: variant.loopContext || [],
              exceptionContext: variant.exceptionContext || [],
            }))),
          })),
          x: Math.max(8, minX - 34),
          y: Math.max(72, minY - 44),
          width: Math.max(180, maxX - minX + 68),
          height: Math.max(96, maxY - minY + 92),
        });
      }
      start = end;
    }
    return fragments;
  }

  function controlText(value) {
    if (typeof value === "string") return value;
    if (!value || typeof value !== "object") return "";
    return value.label || value.condition || value.guard || value.expression || value.kind || value.type || "";
  }

  function fragmentDetail(fragment, calls) {
    const callById = new Map(calls.map((call) => [call.id, call]));
    const fragmentCalls = fragment.callIds.map((id) => callById.get(id)).filter(Boolean);
    const occurrenceCount = fragmentCalls.length + Number(fragment.hiddenOccurrenceCount || 0);
    const routeRows = fragment.variants.map((variant, index) => {
      const steps = [...new Set(variant.occurrences.map((item) => item.rawStep).filter(Boolean))].sort((left, right) => left - right);
      const contexts = [...new Set(variant.occurrences.flatMap((item) => [
        ...(item.controlContext || []),
        ...(item.inheritedControlContext || []),
        ...(item.conditionalContext || []),
        ...(item.loopContext || []),
        ...(item.exceptionContext || []),
      ]).map(controlText).filter(Boolean))];
      const sources = [...new Set(variant.occurrences.map((item) => item.sourceFile ? `${item.sourceFile}${item.sourceLine ? `:${item.sourceLine}` : ""}` : "").filter(Boolean))];
      return `<details class="route-variant" ${index === 0 ? "open" : ""}><summary>Путь ${number(index + 1)} · исходные шаги ${html(steps.join(", ") || "не указаны")}</summary><p class="path">${html(variant.routeId)}</p>${contexts.length ? `<p><b>Условия:</b> ${html(contexts.join("; "))}</p>` : `<p class="empty">Условие не подписано в снимке; точный route ID сохранён.</p>`}${sources.length ? `<p><b>Код:</b> <span class="path">${html(sources.join("; "))}</span></p>` : ""}</details>`;
    }).join("");
    return `<header><span class="eyebrow">ref · общий фрагмент</span><h2>${number(fragmentCalls.length)} ${plural(fragmentCalls.length, "вызов", "вызова", "вызовов")} в ${number(fragment.routeCount)} ${plural(fragment.routeCount, "пути", "путях", "путях")}</h2></header><p><b>Это не несколько последовательных повторов одного запуска.</b> Анализатор нашёл ${number(fragment.routeCount)} статических ${plural(fragment.routeCount, "маршрут", "маршрута", "маршрутов")}, в которых присутствует один и тот же набор физических вызовов.</p><p>Без схлопывания здесь было бы ${number(occurrenceCount)} появлений контрактов. Показано ${number(fragmentCalls.length)}, скрыто ${number(fragment.hiddenOccurrenceCount)} повторных появлений тех же вызовов в других путях.</p><p class="empty">Raw-номера — внутренняя нумерация появлений после разворачивания всех путей, а не строки Java, время выполнения или шаги одного production-запуска.</p><dl><dt>Статических маршрутов</dt><dd>${number(fragment.routeCount)}</dd><dt>Физических вызовов показано</dt><dd>${number(fragmentCalls.length)}</dd><dt>Появлений до схлопывания</dt><dd>${number(occurrenceCount)}</dd><dt>Скрыто повторных появлений</dt><dd>${number(fragment.hiddenOccurrenceCount)}</dd><dt>Raw-номера появлений</dt><dd>${html(fragment.rawSteps.join(", ") || "—")}</dd><dt>Семантика UML</dt><dd>${html(["ref", ...(fragment.semanticTags || [])].join(" + "))}</dd></dl><section><h3>Вызовы фрагмента</h3><ul>${fragmentCalls.map((call) => `<li><b>${html(call.sourceLabel)} → ${html(call.targetLabel)}</b> · ${html(call.payload)}</li>`).join("")}</ul></section><section><h3>Входные пути и условия</h3>${routeRows}</section>`;
  }

  function detail(call) {
    if (!call) return `<div class="placeholder">Выберите стрелку на диаграмме или вызов в таблице.</div>`;
    if (call.isBridge) {
      const bridge = call.bridge || {};
      return `
        <header><span class="eyebrow">Внешняя граница</span><h2>${html(call.sourceLabel)} → ${html(call.targetLabel)}</h2></header>
        <p>В исходниках найден клиент, но код принимающего сервиса отсутствует в анализируемом корпусе. Это намерение вызова, а не доказанная межсервисная связь.</p>
        <dl><dt>Транспорт</dt><dd>${html(text(bridge.transportKind))}</dd><dt>Payload</dt><dd>${html(text(bridge.payloadTypes))}</dd><dt>Выходов в коде</dt><dd>${number(bridge.exitCount)}</dd></dl>
        <h3>Точки выхода</h3>${list(bridge.sampleExitIds, "Не раскрыты")}`;
    }
    const contract = call.contract || call.contracts?.[0] || {};
    const response = call.responseSemantics || {};
    const compatibility = call.responsePayloadCompatibility || {};
    const responseUsage = call.responseUsageEvidence || contract.responseUsageEvidence || {};
    const http = call.sourceHttpOperationVariant || {};
    const order = call.order || {};
    const responseLabel = response.isSynchronous ? "Синхронный ответ доказан" : "Ответ вызывающему не доказан";
    const routeVariants = call.variantCount > 1 ? `<details class="route-variant"><summary>Показать ${number(call.variantCount)} входных путей этого вызова</summary>${(call.routeVariants || []).map((variant, index) => {
      const contexts = [...new Set([
        ...(variant.controlContext || []),
        ...(variant.inheritedControlContext || []),
        ...(variant.conditionalContext || []),
        ...(variant.loopContext || []),
        ...(variant.exceptionContext || []),
      ].map(controlText).filter(Boolean))];
      return `<p><b>Путь ${number(index + 1)}</b> · исходный шаг ${number(variant.rawStep)}<br><span class="path">${html(variant.routeId || "route ID не указан")}</span>${contexts.length ? `<br>${html(contexts.join("; "))}` : ""}</p>`;
    }).join("")}</details>` : "";
    return `
      <header><span class="eyebrow">Показ ${html(text(call.step, "?"))}${call.displayStep !== call.step ? ` · исходный шаг ${html(text(call.displayStep, "?"))}` : ""}</span><h2>${html(call.sourceLabel)} → ${html(call.targetLabel)}</h2><p>${html(call.sourceGroup)} → ${html(call.targetGroup)}</p></header>
      <section><h3>Порядок и назначение</h3>
        <dl><dt>Процесс</dt><dd>${html(text(order.processName || order.processId, "Вне восстановленного процесса"))}</dd><dt>Показанный шаг</dt><dd>${html(text(call.step, "?"))}</dd><dt>Исходный шаг / этап</dt><dd>${html(text(order.step, "?"))} / ${html(text(order.stage, "?"))}</dd><dt>Входных путей</dt><dd>${number(call.variantCount || 1)}${call.variantCount > 1 ? " — один вызов, не повторы подряд" : ""}</dd><dt>Порядок</dt><dd>${html(text(order.ordering || order.reason, "Не определён"))}</dd><dt>Готовность шага</dt><dd>${html(text(order.readiness?.score != null ? `${order.readiness.score}/100` : ""))}</dd></dl>
        ${order.purpose ? `<p><b>Зачем:</b> ${html(order.purpose)}</p>` : `<p class="empty">Бизнес-назначение шага не рассчитано.</p>`}
        ${citations(call)}
        ${(order.purposeGaps || []).map((gap) => `<p class="warning">Не подтверждено: ${html(gap)}</p>`).join("")}
        ${routeVariants}
      </section>
      <section><h3>Контракт</h3>
        <dl><dt>Модель</dt><dd>${html(text(call.payload))}</dd><dt>Направление</dt><dd>${html(text(call.direction))}</dd><dt>Транспорт</dt><dd>${html(text(call.transport))}</dd><dt>Почему связь принята</dt><dd>${html(text(call.proof))}</dd><dt>Уровень доказательств</dt><dd>${html(text(call.qualityTier))}</dd><dt>Технический ID</dt><dd class="path">${html(text(call.contractId || call.id))}</dd></dl>
      </section>
      <section><h3>Ответ</h3>
        <p class="${response.isSynchronous ? "success" : "warning"}">${html(responseLabel)}</p>
        <dl><dt>Основание</dt><dd>${html(text(response.kind))}</dd><dt>Модель у клиента</dt><dd>${html(text(call.sourceResponsePayloadTypes))}</dd><dt>Модель у endpoint</dt><dd>${html(text(call.targetResponsePayloadTypes))}</dd><dt>Совместимость</dt><dd>${html(text(compatibility.status))}</dd><dt>Обработка в клиенте</dt><dd>${html(text(responseUsage.status))}</dd></dl>
      </section>
      <section><h3>HTTP-вызов</h3>
        <dl><dt>Метод</dt><dd>${html(text([http.method, http.path || http.path_expression].filter(Boolean)))}</dd><dt>Место в коде</dt><dd class="path">${html(text(http.caller_class ? `${http.caller_class}.${http.caller_method || "?"}@${http.line || 0}` : ""))}</dd><dt>Объект запроса</dt><dd>${html(text(http.request_object_type))}</dd><dt>Бизнес-модель</dt><dd>${html(text(http.request_body_type))}</dd></dl>
      </section>
      <section><h3>Связанные поля (${number(call.fieldCount)})</h3>${list(call.fields, "Подтверждённых связей полей нет")}${fieldJourneys(call)}</section>
      <section><h3>Физические поля моделей</h3><h4>${html(call.sourceLabel)} (${number(call.sourceFieldCount)})</h4>${list(call.sourceFields, "Структура модели отправителя не раскрыта")}<h4>${html(call.targetLabel)} (${number(call.targetFieldCount)})</h4>${list(call.targetFields, "Структура модели получателя не раскрыта")}</section>
      <section><h3>Excel-маппинг контракта</h3>${dataSurf(call)}</section>
      <section><h3>Архитектурный реестр</h3>${architectureRegistry(call)}</section>
      ${(contract.negativeEvidence || []).map((item) => `<p class="warning">Контрдоказательство: ${html(item.kind || "расхождение доказательств")} ${html([item.sourcePayload, item.targetPayload].filter(Boolean).join(" vs "))}</p>`).join("")}
      <details><summary>Исходные данные связи (JSON)</summary><pre>${html(JSON.stringify(call, null, 2))}</pre></details>`;
  }

  function callRows(calls) {
    return calls.map((call) => {
      const response = call.responseSemantics?.isSynchronous ? "ответ доказан" : "ответ не доказан";
      const contract = call.contract || call.contracts?.[0] || {};
      const mapping = mappingData(contract);
      const mappingCell = mapping.packageHref
        ? `<a class="table-asset-link" href="${html(mapping.packageHref)}" title="Открыть Excel маппинга">Excel</a>`
        : `<span class="empty">—</span>`;
      const search = [call.sourceLabel, call.targetLabel, call.sourceGroup, call.targetGroup, call.payload, call.transport, ...(call.fields || [])].join(" ").toLowerCase();
      return `<tr data-call-id="${html(call.id)}" data-search="${html(search)}"><td>${html(call.displayStep || call.step)}</td><td><b>${html(call.sourceLabel)}</b><span>${html(call.sourceGroup)}</span></td><td>→</td><td><b>${html(call.targetLabel)}</b><span>${html(call.targetGroup)}</span></td><td><b>${html(call.payload)}</b><span>${html(call.transport)}</span></td><td>${html(call.proof)}<span>${html(response)}</span></td><td>${number(call.fieldCount)}</td><td>${mappingCell}</td></tr>`;
    }).join("");
  }

  function safeJson(value) {
    return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026");
  }

  function buildHtml(payload) {
    const data = payload.data || {};
    const calls = data.calls || [];
    const routeFragments = data.routeFragments || buildRouteFragments(calls);
    const process = payload.process || {};
    const participants = data.participants || [];
    const initial = calls[0] || null;
    const provenResponses = calls.filter((call) => call.responseSemantics?.isSynchronous).length;
    const fieldLinks = calls.reduce((sum, call) => sum + Number(call.fieldCount || 0), 0);
    const sourceGroups = [...new Set(calls.flatMap((call) => [call.sourceGroup, call.targetGroup]).filter(Boolean))];
    const mappings = calls.map((call) => mappingData(call.contract || call.contracts?.[0] || {})).filter((item) => item.packageHref || item.href || item.file);
    const completeMappings = mappings.filter((item) => item.status === "complete").length;
    const partialMappings = mappings.filter((item) => item.status === "partial").length;
    return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>${html(payload.title || "AI Profiler — сиквенс")}</title>
<style>
:root{--bg:#f4f7f6;--surface:#fff;--soft:#f8fbfa;--line:#d7e1dd;--strong:#b9cbc4;--text:#16231f;--muted:#62736c;--green:#0d8f62;--dark:#07523b;--amber:#a96700;--red:#b93838;--shadow:0 12px 32px rgba(18,48,38,.08)}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font-family:"Segoe UI",Arial,sans-serif;font-size:14px}button,input{font:inherit}button{cursor:pointer}.top{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:18px;padding:12px 20px;border-bottom:1px solid var(--line);background:rgba(255,255,255,.97)}.brand{color:var(--dark);font-weight:800;font-size:18px}.top input{flex:1;min-width:180px;height:36px;border:1px solid var(--line);border-radius:6px;padding:0 10px}.controls{display:flex;gap:6px}.controls button{height:36px;min-width:38px;border:1px solid var(--line);border-radius:6px;background:#fff;color:var(--dark)}.controls .zoom-value{min-width:58px;cursor:default}main{padding:18px 20px 32px}.heading{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.heading h1{margin:0;font-size:24px}.heading p{margin:5px 0 0;color:var(--muted)}.stamp{font-size:12px;text-align:right}.stats{display:grid;grid-template-columns:repeat(5,minmax(130px,1fr));gap:9px;margin:16px 0}.stat{padding:11px 12px;border:1px solid var(--line);border-radius:7px;background:#fff}.stat b{display:block;color:var(--dark);font-size:20px}.stat span{color:var(--muted);font-size:12px}.context{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.tag,.chips span{border:1px solid #c5dfd5;border-radius:5px;background:#eef8f4;color:#07523b;padding:3px 7px;font-size:12px}.workspace{display:grid;grid-template-columns:minmax(0,1fr) 390px;height:min(76vh,900px);min-height:560px;border:1px solid var(--line);border-radius:8px;background:#fff;overflow:hidden;box-shadow:var(--shadow)}.workspace:fullscreen{width:100vw;height:100vh;min-height:0;border:0;border-radius:0}.diagram{overflow:auto;overscroll-behavior:contain;touch-action:none;background-image:linear-gradient(to right,rgba(13,143,98,.06) 1px,transparent 1px),linear-gradient(to bottom,rgba(13,143,98,.06) 1px,transparent 1px);background-size:42px 42px;cursor:grab}.diagram.panning{cursor:grabbing;user-select:none}.diagram svg{display:block;max-width:none;transform-origin:0 0;user-select:none}.diagram [data-call-id]{cursor:pointer}.diagram [data-call-id].selected rect{stroke:var(--green);stroke-width:3;filter:drop-shadow(0 4px 5px rgba(13,143,98,.24))}.diagram [data-call-id].filtered{opacity:.12}.details{overflow:auto;border-left:1px solid var(--line);padding:16px}.details header{padding-bottom:12px;border-bottom:1px solid var(--line)}.details h2{margin:3px 0 0;font-size:18px}.details h3{margin:18px 0 8px;font-size:14px}.details h4{margin:12px 0 6px}.details p{line-height:1.45}.eyebrow{color:var(--green);font-size:12px;font-weight:700;text-transform:uppercase}.details header p,.empty{color:var(--muted)}dl{display:grid;grid-template-columns:145px minmax(0,1fr);gap:6px 10px;margin:9px 0}dt{color:var(--muted)}dd{margin:0;font-weight:600;overflow-wrap:anywhere}.chips{display:flex;flex-wrap:wrap;gap:5px}.table-wrap,.catalog-wrap{overflow:auto;border:1px solid var(--line);border-radius:7px}table{width:100%;border-collapse:collapse;background:#fff}th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{position:sticky;top:0;background:var(--soft);color:var(--muted);font-size:12px}td span{display:block;margin-top:3px;color:var(--muted);font-size:12px}.arrow{text-align:center;color:var(--green);font-weight:700}.warning{border-left:3px solid var(--amber);padding-left:9px;color:#714800}.success{color:var(--green);font-weight:700}.path,code,pre{font-family:Consolas,monospace;overflow-wrap:anywhere}.asset-link,.table-asset-link{display:inline-flex;align-items:center;min-height:34px;padding:0 10px;border:1px solid var(--green);border-radius:6px;color:var(--dark);font-weight:700;text-decoration:none}.table-asset-link{min-height:26px;padding:0 8px;font-size:12px}.asset-link:hover,.table-asset-link:hover{background:#edf8f3}.evidence{padding-left:20px}.evidence li{margin:5px 0}details{margin-top:12px}summary{cursor:pointer;color:var(--dark);font-weight:700}pre{max-height:420px;overflow:auto;padding:10px;background:#111b18;color:#d8f3e8;border-radius:6px;font-size:11px}.catalog{margin-top:18px}.catalog h2{margin:0 0 10px}.catalog tbody tr{cursor:pointer}.catalog tbody tr:hover,.catalog tbody tr.selected{background:#edf8f3}.catalog tbody tr.filtered{display:none}.placeholder{color:var(--muted);padding:30px 0;text-align:center}@media(max-width:900px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.workspace{grid-template-columns:1fr;height:auto}.diagram{height:60vh}.details{max-height:none;border-left:0;border-top:1px solid var(--line)}.top{flex-wrap:wrap}.top input{order:3;flex-basis:100%}.heading{display:block}.stamp{text-align:left;margin-top:6px}}@media print{.top{position:static}.controls{display:none}.workspace{display:block;height:auto}.diagram{overflow:visible}.details{border:0}.catalog{break-before:page}}
</style><style>
.diagram{position:relative}.sequence-stage{position:relative;min-width:100%;min-height:100%;user-select:none}.sequence-sticky-services{position:sticky;top:0;z-index:30;background:rgba(255,255,255,.94);border-bottom:1px solid var(--line);backdrop-filter:blur(8px)}.seq-service{position:absolute;top:11px;height:42px;display:flex;align-items:center;justify-content:center;padding:0 8px;border:1px solid var(--strong);border-radius:8px;background:#fff;color:var(--dark);overflow:hidden}.seq-service strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.seq-lifeline{position:absolute;border-left:1px dashed #b8cdc5}.seq-proc-divider{position:absolute;left:12px;border-top:2px dashed #a9beb6;z-index:1}.seq-proc-divider span{position:absolute;top:-12px;left:0;max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:2px 10px;border:1px solid var(--line);border-radius:12px;background:#fff;color:var(--muted);font-size:10px;font-weight:700;text-transform:uppercase}.seq-fragment{position:absolute;z-index:1;border:2px solid rgba(39,117,209,.42);background:rgba(234,243,252,.18);pointer-events:none}.seq-fragment.selected{border-color:#2775d1;background:rgba(234,243,252,.28);box-shadow:0 0 0 3px rgba(39,117,209,.1)}.seq-fragment-tab{position:absolute;top:-30px;left:-2px;max-width:min(520px,calc(100% + 4px));height:30px;display:flex;align-items:center;gap:7px;overflow:hidden;padding:0 9px;border:2px solid rgba(39,117,209,.42);border-bottom:0;border-radius:6px 6px 0 0;background:#f2f7fd;color:#183f70;pointer-events:auto;cursor:pointer;text-align:left}.seq-fragment-tab:hover,.seq-fragment.selected .seq-fragment-tab{border-color:#2775d1;background:#e8f2fc}.seq-fragment-tab b{font:700 12px Consolas,monospace}.seq-fragment-tab span,.seq-fragment-tab small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.seq-fragment-tab span{font-size:11px;font-weight:700}.seq-fragment-tab small{color:var(--muted);font-size:10px}.seq-fragment-tags{position:absolute;top:4px;right:5px;display:flex;gap:4px}.seq-fragment-tags span{border:1px solid #b9d4ef;border-radius:4px;background:#f2f7fd;color:#245b91;padding:2px 5px;font:10px Consolas,monospace}.seq-call{position:absolute;height:42px;cursor:pointer;z-index:2}.seq-call:hover,.seq-call.selected{z-index:20}.seq-call-line{position:absolute;left:0;right:0;top:21px;border-top:3px solid var(--green);color:var(--green)}.seq-call.tier-proven .seq-call-line{border-color:#2775d1;color:#2775d1}.seq-call.tier-inferred .seq-call-line{border-color:#839990;color:#839990;border-top-style:dashed}.seq-call.tier-candidate .seq-call-line{border-color:#bf7a09;color:#bf7a09;border-top-style:dashed}.seq-call-line::after,.seq-call-line::before{content:"";position:absolute;top:-7px;width:0;height:0}.seq-call.forward .seq-call-line::after{right:-2px;border-top:7px solid transparent;border-bottom:7px solid transparent;border-left:13px solid currentColor}.seq-call.reverse .seq-call-line::after{left:-2px;border-top:7px solid transparent;border-bottom:7px solid transparent;border-right:13px solid currentColor}.seq-call.bidir .seq-call-line::before{left:-2px;border-top:7px solid transparent;border-bottom:7px solid transparent;border-right:13px solid currentColor}.seq-call-card{position:absolute;top:-22px;left:50%;width:270px;transform:translateX(-50%) scale(var(--seq-card-scale,1));transform-origin:top center;border:1px solid var(--strong);border-radius:8px;background:rgba(255,255,255,.64);padding:7px 9px;box-shadow:0 8px 20px rgba(18,48,38,.07);transition:background-color .14s ease,box-shadow .14s ease,border-color .14s ease}.seq-call:hover .seq-call-card,.seq-call.selected .seq-call-card{background:rgba(255,255,255,.98);border-color:var(--green);box-shadow:0 0 0 2px rgba(13,143,98,.13),0 14px 30px rgba(18,48,38,.16)}.seq-call-card strong,.seq-call-card>span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.seq-call-card strong{font-size:11px;line-height:1.2}.seq-call-card>span{margin-top:3px;color:var(--muted);font-size:10.5px}.seq-badges{display:flex;gap:4px;margin-top:5px;overflow:hidden;white-space:nowrap}.seq-badges span{flex:0 0 auto;border:1px solid #c5dfd5;border-radius:5px;background:#eef8f4;color:#07523b;padding:2px 5px;font-size:9px}.seq-call:hover .seq-badges{flex-wrap:wrap;overflow:visible}.seq-call-return{position:absolute;left:0;right:0;top:33px;border-top:2px dashed #2775d1;opacity:.65}.seq-call-return span{position:absolute;top:-16px;right:8px;color:#2775d1;font-size:10px}.route-variant{margin-top:8px;padding:7px 9px;border-left:3px solid #b9d4ef;background:#f7faff}.route-variant summary{cursor:pointer;color:#183f70;font-size:11px;font-weight:700}.route-variant p{margin:7px 0 0;font-size:11px}.diagram [data-call-id].filtered{opacity:.12}
</style></head><body>
<div class="top"><div class="brand">AI Profiler</div><input id="search" placeholder="Фильтр: сервис, ФП, модель или поле…"><div class="controls"><button id="fullscreen" title="Открыть диаграмму на весь экран">Весь экран</button><button id="fit" title="Вписать диаграмму в окно">Вписать</button><button id="minus" title="Уменьшить">−</button><button id="plus" title="Увеличить">+</button><button id="reset" title="Вернуть масштаб 100%">100%</button><button class="zoom-value" id="zoom-value" title="Текущий масштаб" disabled>100%</button></div></div>
<main><div class="heading"><div><h1>${html(payload.title || "Сиквенс межсервисных вызовов")}</h1><p>${html(process.name || "Все показанные процессы")} · снимок ${html(payload.snapshot?.name || payload.snapshot?.id || "")}</p></div><p class="stamp">Экспортировано ${html(payload.generatedAt || "")}<br>Фильтр: ${html(payload.filter || "без фильтра")}</p></div>
<div class="stats"><div class="stat"><b>${number(participants.length)}</b><span>сервисов</span></div><div class="stat"><b>${number(calls.length)}</b><span>вызовов</span></div><div class="stat"><b>${number(provenResponses)}</b><span>ответов доказано</span></div><div class="stat"><b>${number(fieldLinks)}</b><span>связей полей</span></div><div class="stat"><b>${number(completeMappings)}/${number(mappings.length)}</b><span>полных Excel-маппингов</span></div></div>
<div class="context">${sourceGroups.map((group) => `<span class="tag">${html(group)}</span>`).join("")}${payload.confidentOnly ? `<span class="tag">только уверенные связи</span>` : ""}${routeFragments.length ? `<span class="tag">${number(routeFragments.length)} ${plural(routeFragments.length, "общий фрагмент раскрывается", "общих фрагмента раскрываются", "общих фрагментов раскрываются")} по клику</span>` : ""}${partialMappings ? `<span class="tag">${number(partialMappings)} Excel с явно указанными разрывами</span>` : ""}</div>
<div class="workspace"><div class="diagram" id="diagram"></div><aside class="details" id="details">${detail(initial)}</aside></div>
<section class="catalog"><h2>Все вызовы отчёта</h2><div class="catalog-wrap"><table><thead><tr><th>Шаг</th><th>Отправитель</th><th></th><th>Получатель</th><th>Модель / транспорт</th><th>Доказательство / ответ</th><th>Поля</th><th>Маппинг</th></tr></thead><tbody>${callRows(calls)}</tbody></table></div></section></main>
<script id="report-data" type="application/json">${safeJson({ calls, participants, routeFragments, width: data.width, height: data.height })}</script>
<div hidden>${calls.map((call, index) => `<template id="detail-${index}" data-detail-id="${html(call.id)}">${detail(call)}</template>`).join("")}${routeFragments.map((fragment, index) => `<template id="fragment-detail-${index}" data-fragment-detail-id="${html(fragment.id)}">${fragmentDetail(fragment, calls)}</template>`).join("")}</div>
<script>
(function(){
var report=JSON.parse(document.getElementById('report-data').textContent);var calls=new Map(report.calls.map(function(c){return[c.id,c]}));var fragments=new Map((report.routeFragments||[]).map(function(f){return[f.id,f]}));var workspace=document.querySelector('.workspace');var diagram=document.getElementById('diagram');var details=document.getElementById('details');var zoomValue=document.getElementById('zoom-value');var zoom=1;var drag=null;var selectedId=report.calls[0]?report.calls[0].id:'';var selectedFragmentId='';
function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(ch){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]})}
function plural(value,one,few,many){var count=Math.abs(Number(value||0))%100;var last=count%10;if(count>10&&count<20)return many;if(last===1)return one;if(last>=2&&last<=4)return few;return many}
function callHtml(call){var reverse=call.x2<call.x1;var same=call.x1===call.x2;var left=Math.min(call.x1,call.x2)*zoom;var width=Math.max(96*zoom,Math.abs(call.x2-call.x1)*zoom);var tier=esc(call.tier||'confirmed');var sync=Boolean(call.responseSemantics&&call.responseSemantics.isSynchronous);var bidir=sync||(call.responseSemantics&&call.responseSemantics.kind==='reverse_contract');var badges=[];if(call.order&&call.order.stage)badges.push('этап '+esc(call.order.stage));if(call.order&&call.order.readiness&&call.order.readiness.score!=null)badges.push('готовность '+esc(call.order.readiness.score)+'/100');if(call.fieldCount)badges.push(esc(call.fieldCount)+' связей полей');if(call.variantCount>1)badges.push('в '+esc(call.variantCount)+' путях');var sourceStep=call.displayStep||call.step;var title=(call.order?'№'+esc(call.step)+(sourceStep!==call.step?' · исх.'+esc(sourceStep):'')+' ':'')+esc(call.sourceLabel)+' → '+esc(call.targetLabel);return '<div class="seq-call tier-'+tier+' '+(reverse?'reverse':'forward')+(bidir?' bidir':'')+(call.id===selectedId&&!selectedFragmentId?' selected':'')+'" data-call-id="'+esc(call.id)+'" style="left:'+(same?call.x1*zoom:left)+'px;top:'+(call.y*zoom)+'px;width:'+width+'px;--seq-card-scale:'+zoom+'"><div class="seq-call-line"></div>'+(sync?'<div class="seq-call-return"><span>‹ ответ (sync)</span></div>':'')+'<div class="seq-call-card"><strong>'+title+'</strong><span>'+esc(call.payload||'модель не определена')+'</span><span>'+esc(call.transport||'транспорт не определён')+' · '+esc(call.proof||'доказательство не указано')+'</span><div class="seq-badges">'+badges.map(function(x){return'<span>'+x+'</span>'}).join('')+'</div></div></div>'}
function fragmentHtml(fragment){var raw=fragment.rawStepMin?'исходные шаги '+fragment.rawStepMin+(fragment.rawStepMax!==fragment.rawStepMin?'–'+fragment.rawStepMax:''):'исходные шаги в деталях';var tags=(fragment.semanticTags||[]).map(function(tag){return'<span>'+esc(tag)+'</span>'}).join('');return '<div class="seq-fragment'+(fragment.id===selectedFragmentId?' selected':'')+'" data-fragment-id="'+esc(fragment.id)+'" style="left:'+(fragment.x*zoom)+'px;top:'+(fragment.y*zoom)+'px;width:'+(fragment.width*zoom)+'px;height:'+(fragment.height*zoom)+'px"><button class="seq-fragment-tab" type="button"><b>ref</b><span>общий фрагмент · '+esc(fragment.routeCount)+' '+plural(fragment.routeCount,'путь','пути','путей')+'</span><small>'+esc(raw)+' · '+esc(fragment.hiddenOccurrenceCount)+' повторов схлопнуто</small></button><div class="seq-fragment-tags">'+tags+'</div></div>'}
function applyFilter(value){var q=String(value||'').trim().toLowerCase();document.querySelectorAll('.catalog tr[data-call-id]').forEach(function(row){var hidden=q&&!row.dataset.search.includes(q);row.classList.toggle('filtered',hidden);document.querySelectorAll('#diagram [data-call-id="'+CSS.escape(row.dataset.callId)+'"]').forEach(function(el){el.classList.toggle('filtered',hidden)})})}
function renderStage(){var width=report.width*zoom;var height=report.height*zoom;var top=66*zoom;diagram.innerHTML='<div class="sequence-stage" style="width:'+width+'px;height:'+height+'px"><div class="sequence-sticky-services" style="width:'+width+'px;height:'+top+'px">'+report.participants.map(function(part){return'<div class="seq-service" style="left:'+((part.x-part.labelW/2)*zoom)+'px;width:'+(part.labelW*zoom)+'px"><strong>'+esc(part.label)+'</strong></div>'}).join('')+'</div>'+report.participants.map(function(part){return'<div class="seq-lifeline" style="left:'+(part.x*zoom)+'px;top:'+top+'px;height:'+(height-top-14)+'px"></div>'}).join('')+report.calls.filter(function(call){return call.processBreak}).map(function(call){return'<div class="seq-proc-divider" style="top:'+((call.y-26)*zoom)+'px;width:'+(width-24)+'px"><span>процесс: '+esc(call.processBreak)+'</span></div>'}).join('')+(report.routeFragments||[]).map(fragmentHtml).join('')+report.calls.map(callHtml).join('')+'</div>';applyFilter(document.getElementById('search').value)}
function select(id){var call=calls.get(id);if(!call)return;selectedId=id;selectedFragmentId='';document.querySelectorAll('[data-call-id]').forEach(function(el){el.classList.toggle('selected',el.dataset.callId===id)});document.querySelectorAll('[data-fragment-id]').forEach(function(el){el.classList.remove('selected')});details.innerHTML=call.__detail||'';if(!call.__detail){var source=document.querySelector('[data-detail-id="'+CSS.escape(id)+'"]');details.innerHTML=source?source.innerHTML:'Детали не найдены'}details.scrollTop=0;document.querySelectorAll('.catalog tr[data-call-id]').forEach(function(row){row.classList.toggle('selected',row.dataset.callId===id)})}
function selectFragment(id){var fragment=fragments.get(id);if(!fragment)return;selectedFragmentId=id;document.querySelectorAll('[data-call-id]').forEach(function(el){el.classList.remove('selected')});document.querySelectorAll('[data-fragment-id]').forEach(function(el){el.classList.toggle('selected',el.dataset.fragmentId===id)});details.innerHTML=fragment.__detail||'Детали фрагмента не найдены';details.scrollTop=0}
report.calls.forEach(function(call,index){call.__detail=document.getElementById('detail-'+index).innerHTML});
(report.routeFragments||[]).forEach(function(fragment,index){fragment.__detail=document.getElementById('fragment-detail-'+index).innerHTML});
function setZoom(next,anchorX,anchorY){var old=zoom;var x=Number.isFinite(anchorX)?anchorX:diagram.clientWidth/2;var y=Number.isFinite(anchorY)?anchorY:diagram.clientHeight/2;var contentX=(diagram.scrollLeft+x)/old;var contentY=(diagram.scrollTop+y)/old;zoom=Math.max(.1,Math.min(3,next));renderStage();diagram.scrollLeft=contentX*zoom-x;diagram.scrollTop=contentY*zoom-y;zoomValue.textContent=Math.round(zoom*100)+'%'}
function zoomAtCenter(next){setZoom(next,diagram.clientWidth/2,diagram.clientHeight/2)}
document.getElementById('plus').onclick=function(){zoomAtCenter(zoom*1.15)};document.getElementById('minus').onclick=function(){zoomAtCenter(zoom/1.15)};document.getElementById('reset').onclick=function(){zoomAtCenter(1)};document.getElementById('fit').onclick=function(){setZoom(Math.min((diagram.clientWidth-24)/report.width,(diagram.clientHeight-24)/report.height),0,0);diagram.scrollLeft=0;diagram.scrollTop=0};document.getElementById('fullscreen').onclick=function(){if(document.fullscreenElement){document.exitFullscreen()}else if(workspace.requestFullscreen){workspace.requestFullscreen()}};
diagram.addEventListener('click',function(event){var fragment=event.target.closest('.seq-fragment[data-fragment-id]');if(fragment){event.stopPropagation();selectFragment(fragment.dataset.fragmentId);return}var el=event.target.closest('.seq-call[data-call-id]');if(el){event.stopPropagation();select(el.dataset.callId)}});document.getElementById('search').addEventListener('input',function(event){applyFilter(event.target.value)});
diagram.addEventListener('pointerdown',function(event){if(event.button!==0||event.target.closest('[data-call-id],a,button,input'))return;drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:diagram.scrollLeft,top:diagram.scrollTop};diagram.setPointerCapture(event.pointerId);diagram.classList.add('panning')});diagram.addEventListener('pointermove',function(event){if(!drag||drag.id!==event.pointerId)return;diagram.scrollLeft=drag.left-(event.clientX-drag.x);diagram.scrollTop=drag.top-(event.clientY-drag.y)});function endDrag(event){if(!drag||drag.id!==event.pointerId)return;try{diagram.releasePointerCapture(event.pointerId)}catch(error){}drag=null;diagram.classList.remove('panning')}diagram.addEventListener('pointerup',endDrag);diagram.addEventListener('pointercancel',endDrag);diagram.addEventListener('wheel',function(event){if(!event.deltaY)return;event.preventDefault();event.stopPropagation();var rect=diagram.getBoundingClientRect();setZoom(zoom*Math.exp(-event.deltaY*.0015),event.clientX-rect.left,event.clientY-rect.top)},{passive:false,capture:true});diagram.addEventListener('dblclick',function(event){if(event.target.closest('[data-call-id]'))return;document.getElementById('fit').click()});document.addEventListener('keydown',function(event){if(event.target.matches('input,textarea,[contenteditable="true"]'))return;if(event.key==='+'||event.key==='='){event.preventDefault();zoomAtCenter(zoom*1.15)}else if(event.key==='-'){event.preventDefault();zoomAtCenter(zoom/1.15)}else if(event.key==='0'){event.preventDefault();zoomAtCenter(1)}else if(event.key.toLowerCase()==='f'){event.preventDefault();document.getElementById('fit').click()}});setZoom(1,0,0);if(report.calls[0])select(report.calls[0].id);
})();
</script>
</body></html>`;
  }

  return { buildHtml };
})();
