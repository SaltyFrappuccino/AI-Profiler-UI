import { describe, expect, test } from "bun:test";
import { contractDetail, sequenceDocument } from "./projections";

describe("report projections", () => {
  test("keeps the sequence data required by the UI", () => {
    const report = {
      services: [{ serviceId: "source" }, { serviceId: "target" }],
      contracts: [{ contractId: "source->target", sourceService: "source", targetService: "target" }],
      processes: [{ processId: "process-1", calls: ["source->target"] }],
      contractFieldLinks: [{ sourceService: "source", targetService: "target", field: "dealId" }],
      summary: { serviceCount: 2 },
    };

    const projection = sequenceDocument(report);

    expect(projection.services).toHaveLength(2);
    expect(projection.contracts).toHaveLength(1);
    expect(projection.processes).toHaveLength(1);
    expect(projection.contractFieldLinks).toHaveLength(1);
    expect(projection.summary).toEqual({ serviceCount: 2 });
  });

  test("normalizes the Excel mapping metadata", () => {
    const detail = contractDetail({
      id: "source->target",
      dataSurf: { file: "map_source_x_target.xlsx", rowCount: 1 },
    });

    expect(detail.mapping.file).toBe("map_source_x_target.xlsx");
    expect(detail.mapping.rowCount).toBe(1);
    expect(detail.dataSurf).toEqual(detail.mapping);
  });
});
