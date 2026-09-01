import { expect, test } from "bun:test";

await import("./process_map_controller.js");

function controller() {
  return globalThis.AIProfilerProcessMapController.create({
    state: {
      graph: { processes: [] },
      sequence: {
        mapStage: null,
        mapView: "overview",
        mapFlow: "all",
        selectedId: "",
        selectedStage: null,
        selectedRegionId: "",
        selectedRelationId: "",
      },
    },
    getElement: () => null,
    esc: String,
    fmt: String,
    pluralRu: () => "элементов",
    uniq: <T>(items: T[]) => [...new Set(items)],
    hasNumericValue: (value: unknown) => value !== null && Number.isFinite(Number(value)),
    processNarrativeSummary: () => "",
    processClosureLabel: () => "",
    transportLabel: String,
    tierText: String,
    focusProcess: () => undefined,
    renderSequenceView: () => undefined,
    renderSequenceDetail: () => undefined,
    bindSequenceCanvasInteractions: () => undefined,
    fitSequence: () => undefined,
    setInspectorTab: () => undefined,
    updateAgentContext: () => undefined,
  });
}

test("value renders missing, scalar, and structured control-flow facts", () => {
  const processMap = controller();

  expect(processMap.value(null)).toBe("—");
  expect(processMap.value("flag == true")).toBe("flag == true");
  expect(processMap.value({ branch: "else" })).toBe('{"branch":"else"}');
});

test("stageFacts resolves only calls declared by the selected stage", () => {
  const processMap = controller();
  const calls = [
    { id: "main", sourceLabel: "A", targetLabel: "B", payload: "Request" },
    { id: "conditional", sourceLabel: "B", targetLabel: "C", payload: "Response" },
    { id: "other", sourceLabel: "C", targetLabel: "D", payload: "Ignored" },
  ];
  const layout = {
    callById: new Map(calls.map((call) => [call.id, call])),
    regions: [],
  };

  const facts = processMap.stageFacts({ callIds: ["main", "conditional"] }, layout);
  expect(facts.calls).toEqual(calls.slice(0, 2));
  expect(facts.services).toEqual(["A", "B", "C"]);
  expect(facts.payloads).toEqual(["Request", "Response"]);
});
