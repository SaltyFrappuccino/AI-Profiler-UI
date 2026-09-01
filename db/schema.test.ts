import { expect, test } from "bun:test";
import { resolve } from "node:path";

const migrationRoot = resolve(import.meta.dir, "migrations");

async function migrationBundle(): Promise<string> {
  const files = [...new Bun.Glob("*.sql").scanSync({ cwd: migrationRoot })].sort();
  return (await Promise.all(files.map((name) => Bun.file(resolve(migrationRoot, name)).text()))).join("\n");
}

test("migrations define the canonical snapshot, catalog, lineage, and delivery tables", async () => {
  const sql = await migrationBundle();
  for (const table of [
    "snapshots",
    "report_imports",
    "source_groups",
    "services",
    "models",
    "model_fields",
    "model_identity_nodes",
    "model_identity_edges",
    "contracts",
    "field_links",
    "processes",
    "process_steps",
    "process_relations",
    "evidence_refs",
    "artifacts",
  ]) {
    expect(sql).toContain(`ai_profiler.${table}`);
  }
});

test("lineage traversal and artifact delivery have physical safeguards", async () => {
  const sql = await migrationBundle();
  expect(sql).toContain("field_links_downstream_confirmed_idx");
  expect(sql).toContain("field_links_upstream_confirmed_idx");
  expect(sql).toContain("artifacts_relative_path_safe");
  expect(sql).toContain("artifacts_relative_path_unique_idx");
  expect(sql).toContain("report_schema_version");
  expect(sql).toContain("snapshot_inventory");
  expect(sql).toContain("GRANT SELECT ON ALL TABLES IN SCHEMA ai_profiler TO ai_profiler_ui");
});
