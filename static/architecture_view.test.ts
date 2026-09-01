import { beforeAll, describe, expect, test } from "bun:test";

beforeAll(async () => {
  await import("./architecture_state.js");
  await import("./architecture_view.js");
});

const esc = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function renderer() {
  return (globalThis as any).AIProfilerArchitectureView;
}

describe("architecture view", () => {
  test("renders live storage metadata and report contract version", () => {
    const result = renderer().render({
      available: true,
      storage: "postgresql",
      snapshot: {
        snapshot_id: "snapshot-1",
        name: "three-fp",
        report_schema_version: "system-lineage.v1",
        document_bytes: 2048,
      },
      runtime: { server_version: "16.4", database_name: "ai_profiler", database_bytes: 4096 },
      counts: { services: 50, snapshots: 1, report_imports: 2 },
      integrity: { primary_keys: 16, foreign_keys: 19, indexes: 31 },
      migrations: [{ version: "005_report_contract_version.sql" }],
      storageModel: {
        layers: [{ id: "snapshot", title: "Снимок анализа", tables: ["snapshots"] }],
        relationships: [["snapshots", "services", "1:N"]],
      },
      tables: [{ table_name: "snapshots", total_bytes: 1024 }],
    }, { esc, fmt: String, formatBytes: (value: unknown) => `${value} B` });

    expect(result.html).toContain("system-lineage.v1");
    expect(result.html).toContain("005_report_contract_version.sql");
    expect(result.html).toContain("Снимки анализа");
    expect(result.html).not.toContain("storage-unavailable");
  });

  test("renders an offline state and escapes snapshot names", () => {
    const result = renderer().render({
      available: false,
      storage: "filesystem",
      snapshot: { name: "<unsafe>" },
      unavailableReason: "postgresql_not_configured",
    }, { esc, fmt: String, formatBytes: String });

    expect(result.html).toContain("storage-unavailable");
    expect(result.html).toContain("&lt;unsafe&gt;");
    expect(result.html).toContain("architecture-export-mermaid\" type=\"button\"");
    expect(result.html).toContain("disabled");
  });

  test("builds stable export file names", () => {
    expect(renderer().fileStem({ snapshot: { name: "three fp / v1" } })).toBe("three_fp_v1");
  });
});
