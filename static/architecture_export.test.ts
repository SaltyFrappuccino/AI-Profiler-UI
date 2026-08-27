import { describe, expect, test } from "bun:test";

await import("./architecture_export.js");

const exporter = (globalThis as typeof globalThis & {
  AIProfilerArchitectureExport: {
    buildDrawio(data: unknown): string;
    buildMermaid(data: unknown): string;
  };
}).AIProfilerArchitectureExport;

const architecture = {
  snapshot: { name: "demo" },
  counts: { snapshots: 1, services: 50 },
  storageModel: {
    layers: [
      { id: "snapshot", title: "Снимок", tables: ["snapshots"] },
      { id: "catalog", title: "Каталог", tables: ["services"] },
    ],
    relationships: [["snapshots", "services", "1:N"]],
  },
};

describe("architecture exports", () => {
  test("builds an editable Mermaid graph", () => {
    const document = exporter.buildMermaid(architecture);
    expect(document).toContain("flowchart LR");
    expect(document).toContain("node_snapshots -- \"1:N\" --> node_services");
    expect(document).toContain("Report Loader");
  });

  test("builds an uncompressed draw.io document", () => {
    const document = exporter.buildDrawio(architecture);
    expect(document).toContain("<mxfile");
    expect(document).toContain('source="node_snapshots" target="node_services"');
    expect(document).toContain("POSTGRESQL · demo");
  });
});
