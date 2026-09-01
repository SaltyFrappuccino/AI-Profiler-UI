import { beforeAll, describe, expect, test } from "bun:test";

beforeAll(async () => {
  (globalThis as any).window = globalThis;
  await import("./presentation.js");
  await import("./labels.js");
  await import("./mapping_view.js");
});

const view = () => (globalThis as any).AIProfilerMappingView;

describe("mapping view", () => {
  test("filters rows and keeps confirmed contracts first", () => {
    const rows = view().buildRows({
      contracts: [
        { contractId: "weak", sourceService: "a", targetService: "b", mapping: {} },
        { contractId: "strong", sourceService: "a", targetService: "c", confirmed: true, mapping: { href: "map.xlsx" } },
      ],
      contractFieldLinks: [{ contractId: "strong", confirmed: true }],
    }, { confidentOnly: true });

    expect(rows.map((row: any) => row.id)).toEqual(["strong"]);
    expect(view().summary({ contracts: rows.map((row: any) => row.contract), contractFieldLinks: [] }, rows))
      .toContain("1/1 имеют Excel");
  });

  test("renders escaped contract details and response coverage", () => {
    const row = view().buildRows({
      contracts: [{
        contractId: "contract-1",
        sourceService: "source",
        targetService: "target",
        confirmed: true,
        transport: "http",
        mapping: { directions: ["request", "response"], compositionSummary: {} },
        sourceContractFields: ["<unsafe>"],
      }],
    })[0];

    const html = view().detailHtml(row);
    expect(html).toContain("запрос и синхронный ответ");
    expect(html).toContain("&lt;unsafe&gt;");
  });
});
