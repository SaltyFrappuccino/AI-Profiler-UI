import { afterEach, expect, test } from "bun:test";

const previousWindow = globalThis.window;
globalThis.window = { location: { pathname: "/app/" } } as unknown as Window & typeof globalThis;
await import("./agent_panel.js");

afterEach(() => {
  globalThis.window = { location: { pathname: "/app/" } } as unknown as Window & typeof globalThis;
});

function controller(state: Record<string, unknown>) {
  return globalThis.AIProfilerAgentPanel.create({
    state,
    getElement: () => null,
    request: async () => ({}),
    esc: String,
    fmt: String,
    fitDiagram: () => {},
  });
}

test("selectedContext keeps the chosen process, stage, and contract", () => {
  const call = { id: "call-1", contractId: "contract-1", order: { stage: 4 } };
  const state = {
    graph: { processes: [{ processId: "process-1", name: "Process" }] },
    snapshot: { id: "snapshot-1" },
    sequence: {
      processId: "process-1",
      selectedId: "call-1",
      selectedStage: null,
      processMapData: { callById: new Map([["call-1", call]]) },
      data: { calls: [] },
    },
    agent: { history: [], loading: false },
  };

  expect(controller(state).selectedContext()).toEqual({
    process: state.graph.processes[0],
    call,
    processId: "process-1",
    contractId: "contract-1",
    stage: 4,
  });
});

test("citationHref links contracts to the selected snapshot", () => {
  const state = {
    graph: { processes: [] },
    snapshot: { id: "snapshot-1" },
    sequence: { processId: "", selectedId: "", selectedStage: null, processMapData: null, data: null },
    agent: { history: [], loading: false },
  };

  expect(controller(state).citationHref({ contractId: "source->target" })).toBe(
    "/app/?view=mappings&snapshot=snapshot-1&mapping=source-%3Etarget",
  );
  expect(controller(state).citationHref({ artifact: "reports/map.xlsx" })).toBe(
    "/file?path=reports%2Fmap.xlsx",
  );
});
