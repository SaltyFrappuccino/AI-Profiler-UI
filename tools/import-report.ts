import { basename, dirname, resolve } from "node:path";
import { closeDatabase } from "../db/database";
import { migrate } from "../db/migrate";
import { artifactRows } from "./report-artifacts";
import { reportEnvelopeErrors } from "./report-contract";
import { normalizedRowErrors, normalizedRows, objects, type JsonObject } from "./report-normalization";
import { persistReport } from "./report-persistence";
import { sha256, slug } from "./report-source";

function option(name: string): string {
  const index = Bun.argv.indexOf(name);
  return index >= 0 ? Bun.argv[index + 1] || "" : "";
}

async function run(): Promise<void> {
  const suppliedPath = option("--report") || Bun.env.REPORT_PATH || "report/system_lineage.json";
  const reportPath = resolve(process.cwd(), suppliedPath);
  const reportFile = Bun.file(reportPath);
  if (!(await reportFile.exists())) throw new Error(`Report not found: ${reportPath}`);

  await migrate();
  const sourceHash = await sha256(reportFile);
  const document = JSON.parse(await reportFile.text()) as JsonObject;
  const envelopeErrors = reportEnvelopeErrors(document);
  if (envelopeErrors.length) {
    throw new Error(`Report contract validation failed:\n${envelopeErrors.join("\n")}`);
  }
  const name = option("--name") || Bun.env.REPORT_NAME || basename(dirname(reportPath));
  const snapshotId = option("--snapshot-id") || `${slug(name)}-${sourceHash.slice(0, 10)}`;
  const services = objects(document.services);
  const contracts = objects(document.contracts);
  const processes = objects(document.processes);
  const fieldLinks = objects(document.contractFieldLinks);
  const normalized = normalizedRows(snapshotId, document);
  const normalizationErrors = normalizedRowErrors(document, normalized);
  if (normalizationErrors.length) {
    throw new Error(`Report graph integrity failed:\n${normalizationErrors.slice(0, 30).join("\n")}`);
  }
  const artifacts = await artifactRows(snapshotId, reportPath);
  await persistReport({
    snapshotId,
    name,
    sourceHash,
    reportPath,
    document,
    services,
    contracts,
    processes,
    fieldLinks,
    normalized,
    artifacts,
  });
  console.log(JSON.stringify({
    snapshotId,
    services: services.length,
    contracts: contracts.length,
    processes: processes.length,
    processSteps: normalized.processSteps.length,
    processRelations: normalized.processRelations.length,
    models: normalized.models.length,
    modelFields: normalized.modelFields.length,
    modelIdentityNodes: normalized.identityNodes.length,
    modelIdentityEdges: normalized.identityEdges.length,
    fieldLinks: fieldLinks.length,
    evidenceRefs: normalized.evidenceRefs.length,
    artifacts: artifacts.length,
  }, null, 2));
}

if (import.meta.main) {
  try {
    await run();
  } finally {
    await closeDatabase();
  }
}
