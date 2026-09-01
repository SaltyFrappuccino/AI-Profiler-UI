import { describe, expect, test } from "bun:test";

await import("./journey_paths.js");

const paths = (globalThis as typeof globalThis & {
  AIProfilerJourneyPaths: {
    findServicePaths: (calls: any[], from: string, to: string, limits?: Record<string, number>) => any[][];
    pathParticipants: (calls: any[]) => Array<{ id: string; label: string }>;
  };
}).AIProfilerJourneyPaths;

const call = (sourceService: string, targetService: string, tier = "confirmed") => ({
  sourceService,
  targetService,
  sourceLabel: sourceService.toUpperCase(),
  targetLabel: targetService.toUpperCase(),
  tier,
});

describe("service journey paths", () => {
  test("ranks a fully confirmed route ahead of a shorter candidate route", () => {
    const result = paths.findServicePaths([
      call("a", "d", "candidate"),
      call("a", "b"),
      call("b", "d"),
    ], "a", "d");

    expect(result.map((path) => path.map((edge) => edge.targetService))).toEqual([
      ["b", "d"],
      ["d"],
    ]);
  });

  test("does not loop through a service already present in the path", () => {
    const result = paths.findServicePaths([
      call("a", "b"),
      call("b", "a"),
      call("b", "c"),
    ], "a", "c");

    expect(result).toHaveLength(1);
    expect(result[0].map((edge) => edge.targetService)).toEqual(["b", "c"]);
  });

  test("returns each participant once", () => {
    expect(paths.pathParticipants([call("a", "b"), call("a", "c")]).map((item) => item.id).sort())
      .toEqual(["a", "b", "c"]);
  });
});
