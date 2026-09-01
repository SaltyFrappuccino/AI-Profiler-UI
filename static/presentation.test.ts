import { describe, expect, test } from "bun:test";

await import("./presentation.js");

const presentation = (globalThis as typeof globalThis & {
  AIProfilerPresentation: Record<string, (...args: any[]) => any>;
}).AIProfilerPresentation;

describe("shared presentation rules", () => {
  test("escapes values rendered into HTML", () => {
    expect(presentation.esc('<a title="x">&</a>')).toBe("&lt;a title=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
  });

  test("describes complete request and response mappings", () => {
    expect(presentation.mappingDirectionsLabel({ directions: ["request", "response"] }))
      .toBe("запрос и синхронный ответ");
  });

  test("does not present an open process as closed", () => {
    expect(presentation.processClosureLabel({
      closureStatus: "open_external_dependency",
      unloadedDependencyCount: 3,
    })).toBe("3 выхода в незагруженные сервисы");
  });

  test("keeps the receiver-focused mapping status explicit", () => {
    expect(presentation.mappingCoverageLabel({
      coverageClass: "consumer_projection_complete",
      targetMappedFieldCount: 5,
      targetSchemaFieldCount: 5,
      unconsumedTransmittedFieldCount: 2,
    })).toContain("полный для получателя");
  });
});
