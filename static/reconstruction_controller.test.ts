import { expect, test } from "bun:test";

await import("./reconstruction_controller.js");

function controller(graph: Record<string, unknown> = {}) {
  const state = {
    graph,
    snapshot: { id: "snapshot-1", name: "Snapshot" },
    reconstruction: {
      mode: "compare",
      processId: "",
      selectedStepId: "",
      aiQueueProcessId: "",
      aiQueue: null,
      aiQueueLoading: false,
      aiVerification: null,
      aiVerificationRunning: false,
      aiCommitRunning: false,
    },
  };
  return globalThis.AIProfilerReconstructionController.create({
    state,
    getElement: () => null,
    request: async () => ({}),
    esc: String,
    fmt: String,
    uniq: <T>(items: T[]) => [...new Set(items)],
    mappingViewUrl: (contractId: string) => `/mappings/${contractId}`,
    download: () => undefined,
    loadSnapshots: async () => undefined,
    showError: () => undefined,
    statuses: { proven: { label: "доказано", className: "proven" } },
    comparisonStatuses: {},
    gapDispositions: {},
  });
}

test("status and evidence layer labels have stable fallbacks", () => {
  const reconstruction = controller();

  expect(reconstruction.status("proven")).toEqual({ label: "доказано", className: "proven" });
  expect(reconstruction.status("new_status")).toEqual({ label: "new_status", className: "unknown" });
  expect(reconstruction.layerLabel("responseLineage", "used_by_caller")).toBe(
    "ответ прослежен до использования",
  );
});

test("contractIds and sourceRefs deduplicate process evidence", () => {
  const reconstruction = controller();
  const process = {
    businessLayer: {
      steps: [{
        contractId: "contract-1",
        implementationReferences: [{ contractId: "contract-2" }],
        sourceRefs: [
          { file: "registry.xlsx", sheet: "Process", row: 7 },
          { file: "registry.xlsx", sheet: "Process", row: 7 },
        ],
      }],
    },
    implementationLayer: {
      codeOnlySteps: [{ contractId: "contract-2", implementationReferences: [] }],
    },
  };

  expect(reconstruction.contractIds(process)).toEqual(["contract-1", "contract-2"]);
  expect(reconstruction.sourceRefs(process)).toEqual([
    { file: "registry.xlsx", sheet: "Process", row: 7 },
  ]);
});
