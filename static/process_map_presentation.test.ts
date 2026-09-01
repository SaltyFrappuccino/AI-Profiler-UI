import { describe, expect, test } from "bun:test";

(globalThis as typeof globalThis & { window: typeof globalThis }).window = globalThis;
await import("./process_map.js");
await import("./process_map_presentation.js");

const globals = globalThis as typeof globalThis & {
  AIProfilerProcessMap: { build(process: unknown, calls: unknown[]): any };
  AIProfilerProcessMapPresentation: {
    build(layout: unknown, options: Record<string, unknown>): any;
    flowKind(call: Record<string, unknown>): string;
  };
};

const processId = "large-process";
const nodes = [
  { nodeId: "entry", displayIndex: 1, stage: 1, ordering: "entry" },
  { nodeId: "conditional-a", displayIndex: 2, stage: 2 },
  { nodeId: "conditional-b", displayIndex: 3, stage: 2 },
  { nodeId: "exception", displayIndex: 4, stage: 2 },
  { nodeId: "next", displayIndex: 5, stage: 3 },
];
const process = {
  processId,
  name: "Large process",
  processIr: {
    nodes,
    relations: [
      { fromNodeId: "entry", toNodeId: "conditional-a", kind: "ordered_before" },
      { fromNodeId: "entry", toNodeId: "conditional-b", kind: "ordered_before" },
      { fromNodeId: "entry", toNodeId: "exception", kind: "causal_continuation" },
      { fromNodeId: "conditional-a", toNodeId: "next", kind: "ordered_before" },
      { fromNodeId: "conditional-b", toNodeId: "next", kind: "ordered_before" },
    ],
    controlRegions: [
      {
        regionId: "guard",
        kind: "guard",
        condition: "context.enabled()",
        arms: [{ label: "then", nodeIds: ["conditional-a", "conditional-b"] }],
      },
      { regionId: "exception-region", kind: "exception", nodeIds: ["exception"] },
    ],
  },
};
const base = {
  tier: "confirmed",
  payload: "Decision",
  transport: "http_client_to_endpoint",
  fieldCount: 3,
};
const calls = [
  {
    ...base,
    id: "entry-call",
    sourceLabel: "Entry",
    targetLabel: "Worker",
    order: { processId, stage: 1, step: 1 },
    processIr: { nodeIds: ["entry"], displayIndex: 1 },
  },
  {
    ...base,
    id: "conditional-call",
    sourceLabel: "Worker",
    targetLabel: "Receiver",
    order: { processId, stage: 2, step: 2 },
    processIr: { nodeIds: ["conditional-a", "conditional-b"], displayIndex: 2 },
  },
  {
    ...base,
    id: "exception-call",
    sourceLabel: "Worker",
    targetLabel: "Fallback",
    order: { processId, stage: 2, step: 4 },
    processIr: { nodeIds: ["exception"], displayIndex: 4 },
  },
  {
    ...base,
    id: "next-call",
    sourceLabel: "Receiver",
    targetLabel: "Store",
    order: { processId, stage: 3, step: 5 },
    processIr: { nodeIds: ["next"], displayIndex: 5 },
  },
];

const fullLayout = globals.AIProfilerProcessMap.build(process, calls);

describe("process map progressive disclosure", () => {
  test("opens a large graph as one summary card per stage", () => {
    const overview = globals.AIProfilerProcessMapPresentation.build(fullLayout, {
      viewMode: "overview",
      flowFilter: "all",
    });

    expect(overview.viewMode).toBe("overview");
    expect(overview.calls).toHaveLength(3);
    expect(overview.calls.every((call: any) => call.isStageSummary)).toBe(true);
    expect(overview.overviewSourceCallCount).toBe(5);
    expect(overview.relations.length).toBeLessThan(fullLayout.relations.length);
    expect(overview.calls.find((call: any) => call.stageRef === 2)?.flowCounts).toEqual({
      conditional: 2,
      exception: 1,
    });
  });

  test("groups repeated operations and keeps only one-hop stage context", () => {
    const stage = globals.AIProfilerProcessMapPresentation.build(fullLayout, {
      viewMode: "stage",
      selectedStage: 2,
      flowFilter: "all",
    });
    const groupedConditional = stage.calls.find((call: any) => (
      call.originalCallId === "conditional-call" && !call.isContext
    ));

    expect(stage.viewMode).toBe("stage");
    expect(stage.selectedStage).toBe(2);
    expect(groupedConditional?.occurrenceCount).toBe(2);
    expect(groupedConditional?.displayStepLabel).toBe("2, 3");
    expect(stage.calls.filter((call: any) => call.isContext)).toHaveLength(2);
    expect(stage.calls.filter((call: any) => call.isContext).every((call: any) => call.isStageContextSummary)).toBe(true);
    expect(stage.contextOccurrenceCount).toBe(2);
    expect(stage.contextualStageCount).toBe(2);
    expect(stage.calls.length).toBeLessThan(fullLayout.calls.length);
  });

  test("selects the first real stage when a stage URL has no number", () => {
    const stage = globals.AIProfilerProcessMapPresentation.build(fullLayout, {
      viewMode: "stage",
      selectedStage: null,
      flowFilter: "all",
    });

    expect(stage.selectedStage).toBe(1);
    expect(stage.filterEmpty).not.toBe(true);
  });

  test("isolates the exception branch without mutating the diagnostic graph", () => {
    const exceptionStage = globals.AIProfilerProcessMapPresentation.build(fullLayout, {
      viewMode: "stage",
      selectedStage: 2,
      flowFilter: "exception",
    });
    const diagnostic = globals.AIProfilerProcessMapPresentation.build(fullLayout, {
      viewMode: "diagnostic",
      flowFilter: "all",
    });

    expect(exceptionStage.calls.filter((call: any) => !call.isContext)).toHaveLength(1);
    expect(exceptionStage.calls.find((call: any) => !call.isContext)?.flowKind).toBe("exception");
    expect(diagnostic.calls).toHaveLength(fullLayout.calls.length);
    expect(fullLayout.calls).toHaveLength(5);
  });
});
