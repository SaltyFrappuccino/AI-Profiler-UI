import { expect, test } from "bun:test";
import { basename, resolve } from "node:path";
import { artifactRows, deliveryRelativePath } from "./report-artifacts";

test("deliveryRelativePath keeps artifacts addressable by the sandbox API", () => {
  const uiRoot = resolve(import.meta.dir, "..");
  expect(deliveryRelativePath(resolve(uiRoot, "report", "artifacts", "map.xlsx"))).toBe(
    "report/artifacts/map.xlsx",
  );
});

test("deliveryRelativePath rejects files outside the UI package", () => {
  const uiRoot = resolve(import.meta.dir, "..");
  expect(() => deliveryRelativePath(resolve(uiRoot, "..", "private", "map.xlsx"))).toThrow(
    "Artifact is outside the UI delivery root",
  );
});

test("bundled report references every delivered Excel artifact", async () => {
  const uiRoot = resolve(import.meta.dir, "..");
  const reportPath = resolve(uiRoot, "report", "system_lineage.json");
  const document = await Bun.file(reportPath).json();
  const rows = await artifactRows("snapshot", reportPath);
  const mappingFiles = document.contracts.map((contract: any) => basename(contract.mapping.file)).sort();

  expect(rows).toHaveLength(224);
  expect(rows.map((row) => row.file_name).sort()).toEqual(mappingFiles);
});
