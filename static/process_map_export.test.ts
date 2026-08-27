import { describe, expect, test } from "bun:test";

(globalThis as typeof globalThis & { window: typeof globalThis }).window = globalThis;
await import("./process_map_export.js");

const exporter = (globalThis as typeof globalThis & {
  AIProfilerProcessMapExport: {
    buildHtml(input: Record<string, unknown>): string;
    buildSvg(report: Record<string, unknown>): string;
  };
}).AIProfilerProcessMapExport;

const report = {
  width: 900,
  height: 620,
  start: { x: 30, y: 180 },
  stages: [{ stage: 1, x: 70, width: 420, callCount: 2, callIds: ["a", "b"] }],
  calls: [
    {
      id: "a",
      displayStep: 1,
      sourceLabel: "Producer",
      targetLabel: "Worker",
      payload: "Request",
      transport: "HTTP",
      tier: "proven",
      processMap: { x: 100, y: 120, width: 250, height: 184 },
      order: { stage: 1, readiness: { score: 96 } },
      guardSummary: "1 условие",
      guardConditions: [{ branch: "then", condition: "request.isValid()" }],
    },
    {
      id: "b",
      displayStep: 2,
      sourceLabel: "Worker",
      targetLabel: "Error Handler",
      payload: "ErrorEvent",
      transport: "Kafka",
      tier: "proven",
      flowKind: "exception",
      processMap: { x: 500, y: 360, width: 250, height: 184 },
      order: { stage: 1, readiness: { score: 88 } },
    },
  ],
  relations: [{
    id: "a-b",
    fromCallId: "a",
    toCallId: "b",
    label: "передача в отдельный поток",
    cssClass: "async",
    path: "M 350 180 H 500 V 420",
    startX: 350,
    startY: 180,
    endX: 500,
    endY: 420,
  }],
  controlPaths: [{
    kind: "exception",
    path: "M 380 210 H 500 V 390",
    label: "только при исключении",
    labelX: 390,
    labelY: 202,
  }],
  regions: [{
    id: "exception",
    kind: "exception",
    renderGateway: false,
    label: "Аварийный путь",
    frameLabel: "Аварийный путь",
    bounds: { x: 470, y: 330, width: 310, height: 240 },
  }],
  terminalPaths: [],
  boundaryPaths: [],
};

describe("process map exports", () => {
  test("keeps process semantics in the standalone HTML", () => {
    const html = exporter.buildHtml({ title: "Process", process: { name: "Demo" }, report });

    expect(html).toContain("request.isValid()");
    expect(html).toContain('"kind":"exception"');
    expect(html).toContain('class="port ');
    expect(html).toContain("только при исключении");
    expect(html).toContain("viewport.addEventListener('wheel'");
  });

  test("keeps process semantics in SVG", () => {
    const svg = exporter.buildSvg(report);

    expect(svg).toContain("request.isValid()");
    expect(svg).toContain("только при исключении");
    expect(svg).toContain("stroke=\"#b33a3a\"");
  });
});
