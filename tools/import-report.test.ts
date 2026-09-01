import { describe, expect, test } from "bun:test";
import { reportEnvelopeErrors } from "./report-contract";
import { normalizedRowErrors, normalizedRows } from "./report-normalization";

function report() {
  return {
    schemaVersion: "system-lineage.v1",
    generatedAt: "2026-09-01T12:00:00",
    summary: {},
    sourceGroups: [],
    services: [{ serviceId: "source" }, { serviceId: "target" }],
    contracts: [{ contractId: "source->target" }],
    processes: [{
      processId: "process-1",
      steps: [
        { stepId: "step-1", contractId: "source->target" },
        { stepId: "step-2", contractId: "source->target" },
      ],
      processIr: { relations: [{ relationId: "r1", fromNodeId: "step-1", toNodeId: "step-2" }] },
    }],
    schemaModelCatalog: [{ serviceId: "source", modelKey: "Request", fieldPaths: ["id"] }],
    modelIdentityGraph: { nodes: [], edges: [] },
  };
}

describe("report graph integrity", () => {
  test("accepts the supported report envelope", () => {
    expect(reportEnvelopeErrors(report())).toEqual([]);
  });

  test("rejects an unsupported report version", () => {
    const document = report();
    document.schemaVersion = "system-lineage.v0";
    expect(reportEnvelopeErrors(document)).toContain(
      "schemaVersion must be system-lineage.v1, got system-lineage.v0",
    );
  });

  test("accepts references backed by the imported report", () => {
    const document = report();
    expect(normalizedRowErrors(document, normalizedRows("snapshot", document))).toEqual([]);
  });

  test("rejects a process relation with a missing step", () => {
    const document = report();
    document.processes[0].processIr.relations[0].toNodeId = "missing";
    const errors = normalizedRowErrors(document, normalizedRows("snapshot", document));
    expect(errors).toContain("relation r1 references unknown target step missing");
  });
});
