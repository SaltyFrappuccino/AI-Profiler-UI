import { expect, test } from "bun:test";
import { artifactHref, safeArtifactPath } from "./artifacts";

test("artifactHref preserves snapshot and file identity", () => {
  expect(artifactHref("snapshot 1", "maps/a b.xlsx")).toBe(
    "/file?snapshot=snapshot+1&path=maps%2Fa+b.xlsx",
  );
});

test("safeArtifactPath rejects traversal outside the UI delivery root", () => {
  expect(safeArtifactPath("reports_system/report.xlsx")).not.toBeNull();
  expect(safeArtifactPath("../secret.txt")).toBeNull();
});
