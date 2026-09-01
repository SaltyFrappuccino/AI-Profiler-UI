import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { deliveryRelativePath } from "./report-artifacts";

test("deliveryRelativePath keeps artifacts addressable by the sandbox API", () => {
  const uiRoot = resolve(import.meta.dir, "..");
  expect(deliveryRelativePath(resolve(uiRoot, "reports_system", "demo", "map.xlsx"))).toBe(
    "reports_system/demo/map.xlsx",
  );
});

test("deliveryRelativePath rejects files outside the UI package", () => {
  const uiRoot = resolve(import.meta.dir, "..");
  expect(() => deliveryRelativePath(resolve(uiRoot, "..", "private", "map.xlsx"))).toThrow(
    "Artifact is outside the UI delivery root",
  );
});
