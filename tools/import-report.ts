import { resolve, relative, dirname, basename, sep } from "node:path";
import { existsSync } from "node:fs";
import { closeDatabase, db } from "../db/database";
import { migrate } from "../db/migrate";
import { sequenceDocument } from "../db/projections";

type JsonObject = Record<string, any>;

function option(name: string): string {
  const index = Bun.argv.indexOf(name);
  return index >= 0 ? Bun.argv[index + 1] || "" : "";
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "snapshot";
}

async function sha256(file: Bun.BunFile): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Buffer.from(digest).toString("hex");
}

async function artifactRows(snapshotId: string, reportPath: string): Promise<JsonObject[]> {
  const root = dirname(reportPath);
  const artifactRoot = resolve(root, "datasurf", "contracts");
  if (!existsSync(artifactRoot)) return [];
  const rows: JsonObject[] = [];
  const glob = new Bun.Glob("**/*");
  for await (const item of glob.scan({ cwd: artifactRoot, onlyFiles: true })) {
    const fullPath = resolve(artifactRoot, item);
    const file = Bun.file(fullPath);
    const extension = item.toLowerCase().split(".").pop();
    if (!new Set(["xlsx", "xls", "csv", "json"]).has(extension || "")) continue;
    const relativePath = relative(resolve(import.meta.dir, ".."), fullPath).split(sep).join("/");
    rows.push({
      snapshot_id: snapshotId,
      artifact_id: `${slug(basename(item))}-${rows.length}`,
      file_name: basename(item),
      relative_path: relativePath,
      media_type: extension === "csv"
        ? "text/csv; charset=utf-8"
        : extension === "json"
          ? "application/json"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size_bytes: file.size,
    });
  }
  return rows;
}

async function insertChunks(transaction: any, table: string, rows: JsonObject[], columns: string[]): Promise<void> {
  for (let index = 0; index < rows.length; index += 500) {
    const chunk = rows.slice(index, index + 500);
    if (chunk.length) await transaction`INSERT INTO ${transaction(table)} ${transaction(chunk, ...columns)}`;
  }
}

async function run(): Promise<void> {
  const suppliedPath = option("--report") || Bun.env.REPORT_PATH || "reports_system/three_fp_v39/system_lineage.json";
  const reportPath = resolve(process.cwd(), suppliedPath);
  const reportFile = Bun.file(reportPath);
  if (!(await reportFile.exists())) throw new Error(`Report not found: ${reportPath}`);

  await migrate();
  const sourceHash = await sha256(reportFile);
  const document = JSON.parse(await reportFile.text()) as JsonObject;
  const name = option("--name") || basename(dirname(reportPath));
  const snapshotId = option("--snapshot-id") || `${slug(name)}-${sourceHash.slice(0, 10)}`;
  const services = (document.services || []).filter((item: unknown) => item && typeof item === "object");
  const contracts = (document.contracts || []).filter((item: unknown) => item && typeof item === "object");
  const processes = (document.processes || []).filter((item: unknown) => item && typeof item === "object");
  const fieldLinks = (document.contractFieldLinks || []).filter((item: unknown) => item && typeof item === "object");
  const artifacts = await artifactRows(snapshotId, reportPath);
  const sql = db();

  await sql.begin(async (transaction) => {
    await transaction`
      INSERT INTO ai_profiler.snapshots
        (snapshot_id, name, source_hash, source_file, summary, sequence_document, document)
      VALUES (
        ${snapshotId}, ${name}, ${sourceHash}, ${reportPath},
        ${transaction.json(document.summary || {})},
        ${transaction.json(sequenceDocument(document))},
        ${transaction.json(document)}
      )
      ON CONFLICT (snapshot_id) DO UPDATE SET
        name = EXCLUDED.name,
        source_hash = EXCLUDED.source_hash,
        source_file = EXCLUDED.source_file,
        imported_at = now(),
        summary = EXCLUDED.summary,
        sequence_document = EXCLUDED.sequence_document,
        document = EXCLUDED.document
    `;
    for (const table of ["services", "contracts", "processes", "field_links", "artifacts"]) {
      await transaction`DELETE FROM ${transaction(`ai_profiler.${table}`)} WHERE snapshot_id = ${snapshotId}`;
    }
    await insertChunks(transaction, "ai_profiler.services", services.map((item: JsonObject, index: number) => ({
      snapshot_id: snapshotId,
      service_id: String(item.serviceId || item.id || index),
      source_group: item.sourceGroup || "unknown",
      payload: transaction.json(item),
    })), ["snapshot_id", "service_id", "source_group", "payload"]);
    await insertChunks(transaction, "ai_profiler.contracts", contracts.map((item: JsonObject, index: number) => ({
      snapshot_id: snapshotId,
      contract_id: String(item.contractId || index),
      source_service: item.sourceService || null,
      target_service: item.targetService || null,
      proof_level: item.proofLevel || null,
      confirmed: Boolean(item.confirmed),
      payload: transaction.json(item),
    })), ["snapshot_id", "contract_id", "source_service", "target_service", "proof_level", "confirmed", "payload"]);
    await insertChunks(transaction, "ai_profiler.processes", processes.map((item: JsonObject, index: number) => ({
      snapshot_id: snapshotId,
      process_id: String(item.processId || index),
      payload: transaction.json(item),
    })), ["snapshot_id", "process_id", "payload"]);
    await insertChunks(transaction, "ai_profiler.field_links", fieldLinks.map((item: JsonObject, index: number) => ({
      snapshot_id: snapshotId,
      link_no: index,
      contract_id: item.contractId || null,
      source_service: item.sourceService || null,
      target_service: item.targetService || null,
      field_name: item.field || null,
      source_paths: transaction.json(item.sourcePaths || []),
      target_paths: transaction.json(item.targetPaths || []),
      proof_level: item.proofLevel || null,
      confirmed: Boolean(item.confirmed),
      payload: transaction.json(item),
    })), [
      "snapshot_id", "link_no", "contract_id", "source_service", "target_service", "field_name",
      "source_paths", "target_paths", "proof_level", "confirmed", "payload",
    ]);
    await insertChunks(transaction, "ai_profiler.artifacts", artifacts, [
      "snapshot_id", "artifact_id", "file_name", "relative_path", "media_type", "size_bytes",
    ]);
  });

  console.log(JSON.stringify({
    snapshotId,
    services: services.length,
    contracts: contracts.length,
    processes: processes.length,
    fieldLinks: fieldLinks.length,
    artifacts: artifacts.length,
  }, null, 2));
}

try {
  await run();
} finally {
  await closeDatabase();
}
