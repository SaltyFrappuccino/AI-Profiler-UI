globalThis.AIProfilerArchitectureExport = (() => {
  const DEFAULT_LABELS = {
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

  const xml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

  const mermaid = (value) => String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll('"', "&quot;")
    .replace(/[\r\n]+/g, " ");

  const id = (value) => `node_${String(value || "item").replace(/[^a-zA-Z0-9_]/g, "_")}`;
  const count = (data, table) => Number(data.counts?.[table] || 0);

  function tableLabel(labels, table) {
    return labels[table] || DEFAULT_LABELS[table] || table;
  }

  function buildMermaid(data = {}, labels = {}) {
    const layers = data.storageModel?.layers || [];
    const relationships = data.storageModel?.relationships || [];
    const snapshotName = data.snapshot?.name || data.snapshot?.snapshot_id || "snapshot";
    const lines = [
      "flowchart LR",
      "  source[\"Отчёт профайлера<br/>JSON + Excel\"]",
      "  loader[\"Report Loader<br/>SHA-256 · проверка · транзакция\"]",
      "  api[\"Bun API<br/>read-only\"]",
      "  consumers[\"UI · AI-агенты · экспорт\"]",
      `  subgraph postgres[\"PostgreSQL · ${mermaid(snapshotName)}\"]`,
      "    direction LR",
    ];
    for (const layer of layers) {
      lines.push(`    subgraph ${id(`layer_${layer.id}`)}[\"${mermaid(layer.title)}\"]`);
      lines.push("      direction TB");
      for (const table of layer.tables || []) {
        lines.push(`      ${id(table)}[\"${mermaid(table)}<br/>${mermaid(tableLabel(labels, table))} · ${count(data, table).toLocaleString("ru-RU")}\"]`);
      }
      lines.push("    end");
    }
    lines.push("  end");
    lines.push("  source -->|Загрузка| loader");
    lines.push("  loader -->|Commit| node_snapshots");
    lines.push("  node_snapshots -->|Read-only| api");
    lines.push("  api --> consumers");
    for (const [source, target, cardinality] of relationships) {
      lines.push(`  ${id(source)} -- \"${mermaid(cardinality)}\" --> ${id(target)}`);
    }
    lines.push("  classDef boundary fill:#ffffff,stroke:#17845f,color:#173a2e,stroke-width:1px;");
    lines.push("  classDef storage fill:#f5f9f7,stroke:#8ebaaa,color:#172b24,stroke-width:1px;");
    lines.push("  class source,loader,api,consumers boundary;");
    lines.push(`  class ${layers.flatMap((layer) => layer.tables || []).map(id).join(",")} storage;`);
    return `${lines.join("\n")}\n`;
  }

  function cell({ cellId, value, style, x, y, width, height, vertex = true, source, target }) {
    if (!vertex) {
      return `<mxCell id="${xml(cellId)}" value="${xml(value)}" style="${xml(style)}" edge="1" parent="1" source="${xml(source)}" target="${xml(target)}"><mxGeometry relative="1" as="geometry"/></mxCell>`;
    }
    return `<mxCell id="${xml(cellId)}" value="${xml(value)}" style="${xml(style)}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry"/></mxCell>`;
  }

  function buildDrawio(data = {}, labels = {}) {
    const layers = data.storageModel?.layers || [];
    const relationships = data.storageModel?.relationships || [];
    const snapshotName = data.snapshot?.name || data.snapshot?.snapshot_id || "snapshot";
    const layerWidth = 300;
    const layerGap = 18;
    const databaseX = 430;
    const databaseY = 70;
    const databaseWidth = Math.max(520, layers.length * (layerWidth + layerGap) + 34);
    const maxTables = Math.max(1, ...layers.map((layer) => (layer.tables || []).length));
    const databaseHeight = 116 + maxTables * 66;
    const apiX = databaseX + databaseWidth + 90;
    const cells = [
      cell({ cellId: "source", value: "ОТЧЁТ ПРОФАЙЛЕРА\nJSON + Excel", style: "rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#17845f;fontColor=#173a2e;fontStyle=1;", x: 30, y: 205, width: 150, height: 68 }),
      cell({ cellId: "loader", value: "REPORT LOADER\nSHA-256 · проверка · транзакция", style: "rounded=1;whiteSpace=wrap;html=1;fillColor=#f3f7fb;strokeColor=#5b8fbd;fontColor=#173a2e;fontStyle=1;", x: 225, y: 198, width: 160, height: 82 }),
      cell({ cellId: "postgres", value: `POSTGRESQL · ${snapshotName}`, style: "swimlane;horizontal=1;startSize=34;rounded=1;whiteSpace=wrap;html=1;fillColor=#eef7f3;swimlaneFillColor=#ffffff;strokeColor=#17845f;fontColor=#173a2e;fontStyle=1;", x: databaseX, y: databaseY, width: databaseWidth, height: databaseHeight }),
      cell({ cellId: "api", value: "BUN API\nread-only", style: "rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#17845f;fontColor=#173a2e;fontStyle=1;", x: apiX, y: 185, width: 130, height: 68 }),
      cell({ cellId: "consumers", value: "UI · AI-АГЕНТЫ · ЭКСПОРТ", style: "rounded=1;whiteSpace=wrap;html=1;fillColor=#f7f9f8;strokeColor=#9cafaa;fontColor=#173a2e;fontStyle=1;", x: apiX, y: 285, width: 170, height: 56 }),
    ];
    layers.forEach((layer, layerIndex) => {
      const x = databaseX + 18 + layerIndex * (layerWidth + layerGap);
      const y = databaseY + 50;
      cells.push(cell({
        cellId: `layer_${layer.id}`,
        value: layer.title,
        style: "swimlane;horizontal=1;startSize=30;rounded=0;whiteSpace=wrap;html=1;fillColor=#f8fbfa;swimlaneFillColor=#edf4f1;strokeColor=#b5c9c1;fontColor=#315348;fontStyle=1;",
        x,
        y,
        width: layerWidth,
        height: databaseHeight - 68,
      }));
      (layer.tables || []).forEach((table, tableIndex) => {
        cells.push(cell({
          cellId: id(table),
          value: `${table}\n${tableLabel(labels, table)} · ${count(data, table).toLocaleString("ru-RU")}`,
          style: "rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#b5c9c1;fontColor=#213b32;align=left;spacingLeft=10;",
          x: x + 12,
          y: y + 42 + tableIndex * 60,
          width: layerWidth - 24,
          height: 46,
        }));
      });
    });
    const flowStyle = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#17845f;strokeWidth=2;endArrow=block;endFill=1;fontColor=#315348;";
    const relationStyle = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#5b8fbd;dashed=1;endArrow=open;endFill=0;fontColor=#315348;";
    cells.push(cell({ cellId: "flow_source_loader", value: "Загрузка", style: flowStyle, vertex: false, source: "source", target: "loader" }));
    cells.push(cell({ cellId: "flow_loader_database", value: "Commit", style: flowStyle, vertex: false, source: "loader", target: "node_snapshots" }));
    cells.push(cell({ cellId: "flow_database_api", value: "Read-only", style: flowStyle, vertex: false, source: "node_snapshots", target: "api" }));
    cells.push(cell({ cellId: "flow_api_consumers", value: "Доступ", style: flowStyle, vertex: false, source: "api", target: "consumers" }));
    relationships.forEach(([source, target, cardinality], index) => {
      cells.push(cell({ cellId: `relation_${index + 1}`, value: cardinality, style: relationStyle, vertex: false, source: id(source), target: id(target) }));
    });
    return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="AI Profiler" agent="AI Profiler" version="24.7.17">
  <diagram id="ai-profiler-architecture" name="Архитектура данных">
    <mxGraphModel dx="2200" dy="1200" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="2400" pageHeight="1400" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        ${cells.join("\n        ")}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
  }

  return { buildDrawio, buildMermaid };
})();
