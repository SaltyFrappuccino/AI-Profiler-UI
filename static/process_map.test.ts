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
      startX: number;
      startY: number;
      endX: number;
      endY: number;
    };
    controlRoute(region: Record<string, any>, target: Record<string, any>, link: Record<string, any>): {
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
      {
        regionId: "guard-region",
        kind: "guard",
        condition: "(context.enabled())",
        sourceLine: 42,
        ownerMethodId: "Demo.process()",
        arms: [{ label: "then", nodeIds: [normalNode.nodeId] }],
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
    expect(normal?.guardSummary).toBe("если: context.enabled()");
    expect(normal?.order.processIr.branchLabels).toEqual(["then"]);
    expect(normal?.order.processIr.branchConditions).toHaveLength(1);
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
    expect(exceptionRegion?.renderGateway).toBe(false);
    expect(exceptionRegion?.links).toEqual([]);
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
    expect(outgoing.map((relation) => relation.routeLabel)).toEqual(["1→2", "1→3"]);
    expect(routes[0].path).not.toBe(routes[1].path);
    expect(routes[0].startY).not.toBe(routes[1].startY);
    expect(routes[0].labelY).not.toBe(routes[1].labelY);
  });

  test("routes an ordered chain vertically inside one stage column", () => {
    const from = {
      order: { stage: 2 },
      processMap: { x: 400, y: 200, width: 284, height: 148 },
    };
    const to = {
      order: { stage: 2 },
      processMap: { x: 400, y: 382, width: 284, height: 148 },
    };

    const route = processMap.edgeRoute(from, to, { kind: "ordered_before" });

    expect(route.path).toBe("M 542 348 V 382");
    expect(route.labelX).toBe(550);
  });

  test("routes a skipped card around the stage column", () => {
    const from = {
      order: { stage: 2 },
      processMap: { x: 400, y: 200, width: 284, height: 184 },
    };
    const to = {
      order: { stage: 2 },
      processMap: { x: 400, y: 636, width: 284, height: 184 },
    };

    const route = processMap.edgeRoute(from, to, { kind: "parallel_join" });

    expect(route.path).not.toContain("M 542 384 V 636");
    expect(route.path).toContain("H 718");
  });

  test("keeps control labels outside the target card", () => {
    const target = { processMap: { x: 620, y: 300, width: 250, height: 184 } };
    const route = processMap.controlRoute(
      { x: 260, y: 120 },
      target,
      { index: 0, labelWidth: 176 },
    );

    expect(route.labelX + 176).toBeLessThan(target.processMap.x);
    expect(route.labelY).toBeLessThan(target.processMap.y);
  });

  test("keeps outbound Excel boundaries outside the proven execution flow", () => {
    const boundaryProcess = {
      ...process,
      architectureRegistryBoundaries: [{
        boundaryId: "registry-outbound",
        direction: "outbound",
        internalService: "worker",
        externalComponent: "External CRM",
        afterStepId: "normal-step",
        routeId: "route-outbound",
        evidenceStatus: "code_boundary_and_registry",
        registryRowIds: ["row-1"],
      }],
    };
    const boundaryCalls = calls.map((call) => call.id === "decision-call"
      ? { ...call, stepId: "normal-step" }
      : call);

    const layout = processMap.build(boundaryProcess, boundaryCalls);
    const registryCall = layout.calls.find((call) => call.isRegistryBoundary);
    const registryRelation = layout.relations.find((relation) => relation.kind === "registry_context");
    const registryStage = layout.stages.find((stage) => stage.isRegistryBoundary);

    expect(registryRelation?.renderMode).toBe("registry_reference");
    expect(registryRelation?.showRouteLabel).toBe(false);
    expect(registryCall?.registryPlacement).toBe("unsequenced_external");
    expect(registryStage?.executionSummary).toBe("порядок относительно шагов не доказан");
    expect(layout.end.points.some((point) => point.sourceCallId === registryCall?.id)).toBe(false);
    expect(layout.end.points.some((point) => point.sourceCallId !== registryCall?.id)).toBe(true);
  });

  test("distinguishes a parallel join from an ordinary ordered edge", () => {
    const joinProcess = {
      ...process,
      processIr: {
        ...process.processIr,
        relations: [{ fromNodeId: entryNode.nodeId, toNodeId: normalNode.nodeId, kind: "parallel_join" }],
      },
    };

    const layout = processMap.build(joinProcess, calls);
    const relation = layout.relations[0];

    expect(relation.cssClass).toBe("join");
    expect(relation.label).toBe("объединение параллельных ветвей");
  });
});
