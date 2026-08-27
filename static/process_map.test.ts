import { describe, expect, test } from "bun:test";

(globalThis as typeof globalThis & { window: typeof globalThis }).window = globalThis;
await import("./process_map.js");

const processMap = (globalThis as typeof globalThis & {
  AIProfilerProcessMap: {
    build(process: unknown, calls: unknown[]): {
      calls: Array<Record<string, any>>;
      relations: Array<Record<string, any>>;
      regions: Array<Record<string, any>>;
      stages: Array<Record<string, any>>;
      end: { points: Array<Record<string, any>> };
    };
    edgeRoute(from: Record<string, any>, to: Record<string, any>, relation: Record<string, any>): {
      path: string;
      labelX: number;
      labelY: number;
    };
  };
}).AIProfilerProcessMap;

const processId = "process-demo";
const entryNode = {
  nodeId: "node-entry",
  executionRouteId: "route-entry",
  displayIndex: 1,
  stage: 1,
  ordering: "entry",
  executionMode: "sequential",
};
const normalNode = {
  nodeId: "node-normal",
  executionRouteId: "route-normal",
  displayIndex: 2,
  stage: 2,
  executionMode: "sequential",
};
const exceptionNode = {
  nodeId: "node-exception",
  executionRouteId: "route-exception",
  displayIndex: 3,
  stage: 2,
  executionMode: "sequential",
};

const process = {
  processId,
  name: "Demo",
  processIr: {
    nodes: [entryNode, normalNode, exceptionNode],
    relations: [
      { fromNodeId: entryNode.nodeId, toNodeId: normalNode.nodeId, kind: "async_handoff" },
      { fromNodeId: entryNode.nodeId, toNodeId: exceptionNode.nodeId, kind: "causal_continuation" },
    ],
    controlRegions: [
      {
        regionId: "async-region",
        kind: "async_task",
        tasks: [{ taskId: "listener:40", nodeIds: [normalNode.nodeId, exceptionNode.nodeId] }],
      },
      {
        regionId: "exception-region",
        kind: "exception",
        sourceLine: 56,
        nodeIds: [exceptionNode.nodeId],
      },
    ],
  },
};

const baseCall = {
  tier: "proven",
  payload: "Decision",
  transport: "http_client_to_endpoint",
  fieldCount: 2,
  order: { processId, stage: 1, step: 1 },
};
const calls = [
  {
    ...baseCall,
    id: "entry-call",
    sourceLabel: "Gateway",
    targetLabel: "Worker",
    processIr: { nodeIds: [entryNode.nodeId], displayIndex: 1 },
  },
  {
    ...baseCall,
    id: "decision-call",
    sourceLabel: "Worker",
    targetLabel: "Receiver",
    order: { processId, stage: 2, step: 2 },
    processIr: { nodeIds: [normalNode.nodeId, exceptionNode.nodeId], displayIndex: 2 },
  },
];

describe("process map execution paths", () => {
  test("keeps normal and exception occurrences of the same contract separate", () => {
    const layout = processMap.build(process, calls);
    const occurrences = layout.calls.filter((call) => call.originalCallId === "decision-call");
    const normal = occurrences.find((call) => call.flowKind === "async");
    const exception = occurrences.find((call) => call.flowKind === "exception");

    expect(occurrences).toHaveLength(2);
    expect(normal?.displayStep).toBe(2);
    expect(exception?.displayStep).toBe(3);
    expect(exception?.processMap.y).toBeGreaterThan(normal?.processMap.y);
    expect(exception?.executionLabel).toBe("только при исключении");
    expect(exception?.order.processIr.predecessorDisplayIndex).toBe(1);
    expect(exception?.order.processIr.causalRelations).toHaveLength(1);
    expect(layout.stages.find((stage) => stage.stage === 1)?.callCountLabel).toBe("1 действие");
    expect(layout.stages.find((stage) => stage.stage === 2)?.callCountLabel).toBe("2 действия");
  });

  test("draws a dedicated exception transition, region and terminal", () => {
    const layout = processMap.build(process, calls);
    const exceptionRelation = layout.relations.find((relation) => relation.cssClass === "exception");
    const exceptionRegion = layout.regions.find((region) => region.kind === "exception");

    expect(exceptionRelation?.label).toBe("переход в обработчик исключения");
    expect(exceptionRegion?.frameLabel).toContain("Аварийный путь");
    expect(layout.end.points.some((point) => point.kind === "exception_end")).toBe(true);
  });

  test("routes fan-out transitions through separate labelled channels", () => {
    const layout = processMap.build(process, calls);
    const entry = layout.calls.find((call) => call.originalCallId === "entry-call")!;
    const outgoing = layout.relations.filter((relation) => relation.fromCallId === entry.id);
    const routes = outgoing.map((relation) => processMap.edgeRoute(
      layout.calls.find((call) => call.id === relation.fromCallId)!,
      layout.calls.find((call) => call.id === relation.toCallId)!,
      relation,
    ));

    expect(outgoing).toHaveLength(2);
    expect(outgoing.map((relation) => relation.sourceChannelIndex)).toEqual([0, 1]);
    expect(outgoing.every((relation) => relation.showRouteLabel)).toBe(true);
    expect(outgoing.map((relation) => relation.routeLabel)).toEqual(["1 → 2", "1 → 3"]);
    expect(routes[0].path).not.toBe(routes[1].path);
    expect(routes[0].labelX).not.toBe(routes[1].labelX);
  });
});
