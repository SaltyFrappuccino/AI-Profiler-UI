globalThis.AIProfilerArchitectureView = (() => {
  const TABLE_LABELS = {
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

  function render(data = {}, helpers = {}) {
    const esc = helpers.esc || ((value) => String(value ?? ""));
    const fmt = helpers.fmt || ((value) => Number(value || 0).toLocaleString("ru-RU"));
    const formatBytes = helpers.formatBytes || ((value) => `${Number(value || 0)} Б`);
    const connection = globalThis.AIProfilerArchitectureState?.connection(data) || {
      connected: false,
      label: "Недоступно",
      profileLabel: "Состояние неизвестно",
      className: "storage-live is-offline",
      description: "Сервер не вернул состояние PostgreSQL.",
    };
    const snapshot = data.snapshot || {};
    const runtime = data.runtime || {};
    const counts = data.counts || {};
    const integrity = data.integrity || {};
    const layers = data.storageModel?.layers || [];
    const relationships = data.storageModel?.relationships || [];
    const tableSizes = Object.fromEntries(
      (data.tables || []).map((item) => [item.table_name, Number(item.total_bytes || 0)]),
    );
    const latestMigration = (data.migrations || []).at(-1)?.version || "—";
    const tableRows = layers.flatMap((layer, layerIndex) => (layer.tables || []).map((table) => ({
      layerIndex,
      table,
      count: counts[table],
      bytes: tableSizes[table],
    })));

    return {
      tableLabels: TABLE_LABELS,
      html: `
        <header class="storage-console-head">
          <div class="storage-console-title">
            <div class="storage-breadcrumb"><span>Платформа данных</span><b>/</b><span>Архитектура</span></div>
            <h2>Модель хранения lineage</h2>
            <p>Версионированный снимок, нормализованный граф и доказательства анализа в едином контуре данных.</p>
          </div>
          <div class="storage-head-tools">
            <div class="storage-export-actions" aria-label="Экспорт архитектуры">
              <button class="btn" id="architecture-export-mermaid" type="button" title="Скачать редактируемую Mermaid-схему" ${connection.connected ? "" : "disabled"}>Mermaid</button>
              <button class="btn" id="architecture-export-drawio" type="button" title="Скачать схему для diagrams.net" ${connection.connected ? "" : "disabled"}>draw.io</button>
            </div>
            <div class="storage-runtime">
              <span class="${esc(connection.className)}"><i></i>${esc(connection.label)}</span>
              <div><small>PostgreSQL</small><b>${esc(String(runtime.server_version || "").split(" ")[0] || "—")}</b></div>
              <div><small>База</small><b>${esc(runtime.database_name || "—")}</b></div>
              <div><small>Схема</small><b>ai_profiler</b></div>
            </div>
          </div>
        </header>

        ${connection.connected ? "" : `<div class="storage-unavailable" role="status"><strong>${esc(connection.profileLabel)}</strong><span>${esc(connection.description)}</span></div>`}

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
                      <td>${esc(TABLE_LABELS[row.table] || row.table)}</td>
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
              <header><span>Состояние</span><b>${esc(connection.profileLabel)}</b></header>
              <dl class="storage-facts">
                <div><dt>Снимок</dt><dd>${esc(snapshot.name || snapshot.snapshot_id || "—")}</dd></div>
                <div><dt>Формат</dt><dd><code>${esc(snapshot.report_schema_version || "—")}</code></dd></div>
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
                <span><i>${esc(TABLE_LABELS[source] || source)}</i><b>${esc(cardinality)}</b><i>${esc(TABLE_LABELS[target] || target)}</i></span>
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
        </div>`,
    };
  }

  function fileStem(data = {}) {
    const snapshotName = String(data.snapshot?.name || data.snapshot?.snapshot_id || "snapshot");
    return snapshotName.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]+/g, "_");
  }

  return { TABLE_LABELS, fileStem, render };
})();
