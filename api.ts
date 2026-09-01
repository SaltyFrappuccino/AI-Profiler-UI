import { db } from "./db/database";
import { artifactHref, artifactResponse, attachArtifactLinks } from "./api/artifacts";
import { fieldJourneys } from "./api/field_journeys";
import { json, message, methodNotAllowed } from "./api/responses";
import { storageArchitecture } from "./api/storage_architecture";

type JsonObject = Record<string, any>;

async function snapshots(): Promise<Response> {
  const sql = db();
  const rows = await sql<JsonObject[]>`
    SELECT inventory.*, snapshots.summary
    FROM ai_profiler.snapshot_inventory AS inventory
    JOIN ai_profiler.snapshots AS snapshots USING (snapshot_id)
    ORDER BY imported_at DESC
    LIMIT 100
  `;
  return json({
    items: rows.map((row) => ({
      id: row.snapshot_id,
      name: row.name,
      path: row.source_file,
      schemaVersion: row.report_schema_version,
      storage: "postgresql",
      importedAt: row.imported_at,
      inventory: {
        services: row.service_count,
        contracts: row.contract_count,
        processes: row.process_count,
        processSteps: row.process_step_count,
        models: row.model_count,
        modelFields: row.model_field_count,
        fieldLinks: row.field_link_count,
        evidenceRefs: row.evidence_ref_count,
        artifacts: row.artifact_count,
      },
      ...(row.summary || {}),
    })),
  });
}

async function sequence(snapshotId: string): Promise<Response> {
  const sql = db();
  const rows = await sql<JsonObject[]>`
    SELECT sequence_document FROM ai_profiler.snapshots WHERE snapshot_id = ${snapshotId}
  `;
  if (!rows.length) return message("snapshot not found", 404);
  const payload = rows[0].sequence_document;
  payload.contracts = (payload.contracts || []).map((contract: JsonObject) => {
    const mapping = contract.mapping || contract.dataSurf || {};
    mapping.href = artifactHref(snapshotId, mapping.file || "");
    return { ...contract, mapping, dataSurf: mapping };
  });
  return json(payload);
}

async function snapshotView(snapshotId: string, view: string): Promise<Response> {
  const sql = db();
  if (view === "mappings") {
    const contracts = await sql<JsonObject[]>`
      SELECT payload FROM ai_profiler.contracts WHERE snapshot_id = ${snapshotId} ORDER BY contract_id
    `;
    const links = await sql<JsonObject[]>`
      SELECT payload FROM ai_profiler.field_links WHERE snapshot_id = ${snapshotId} ORDER BY link_no
    `;
    return json({
      view,
      storage: "postgresql",
      contracts: contracts.map((row) => attachArtifactLinks(snapshotId, row.payload)),
      contractFieldLinks: links.map((row) => row.payload),
    });
  }
  if (view === "architecture") return storageArchitecture(snapshotId);
  if (view === "fields") {
    const links = await sql<JsonObject[]>`
      SELECT payload FROM ai_profiler.field_links WHERE snapshot_id = ${snapshotId} ORDER BY link_no
    `;
    return json({ view, storage: "postgresql", contractFieldLinks: links.map((row) => row.payload) });
  }
  const rows = await sql<JsonObject[]>`
    SELECT document FROM ai_profiler.snapshots WHERE snapshot_id = ${snapshotId}
  `;
  if (!rows.length) return message("snapshot not found", 404);
  const document = rows[0].document || {};
  const payload: JsonObject = { view, storage: "postgresql" };
  if (view === "reconstruction") {
    payload.summary = document.summary || {};
    payload.architectureRegistry = document.architectureRegistry || {};
  } else if (view === "models") {
    payload.modelIdentityGraph = document.modelIdentityGraph || {};
    payload.schemaModelCatalog = document.schemaModelCatalog || [];
  } else if (view === "gaps") {
    payload.consistencyConflicts = document.consistencyConflicts || {};
    payload.diagnostics = document.diagnostics || {};
  } else if (view === "briefing") {
    payload.briefing = document.architectBriefing || document.scenarioSummary || null;
  } else if (view !== "overview") {
    return message("unsupported snapshot view", 404);
  }
  return json(payload);
}

async function contract(snapshotId: string, contractId: string): Promise<Response> {
  const sql = db();
  const rows = await sql<JsonObject[]>`
    SELECT payload FROM ai_profiler.contracts
    WHERE snapshot_id = ${snapshotId} AND contract_id = ${contractId}
  `;
  if (!rows.length) return message("contract not found", 404);
  return json(attachArtifactLinks(snapshotId, rows[0].payload));
}

export async function api(request: Request, url: URL): Promise<Response | null> {
  try {
    const agentRequest = url.pathname === "/api/agent/ask";
    if (agentRequest && request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }
    if (!agentRequest
      && (url.pathname.startsWith("/api/") || url.pathname === "/file")
      && request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }
    if (url.pathname === "/api/capabilities") {
      return json({
        profile: "sandbox-readonly",
        storage: ["postgresql"],
        features: {
          snapshotRead: true,
          reportRuns: false,
          groundedAgent: false,
          llmAgent: false,
          reconstructionVerification: false,
          exportPackages: false,
          datasurfPreview: false,
        },
      });
    }
    if (url.pathname === "/api/health/live") {
      return json({ status: "ok", service: "ai-profiler-ui" });
    }
    if (url.pathname === "/api/health/ready") {
      const sql = db();
      const rows = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM ai_profiler.snapshots`;
      return json({ status: "ready", storage: "postgresql", snapshotCount: rows[0].count });
    }
    if (url.pathname === "/api/storage/health") {
      const sql = db();
      const rows = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM ai_profiler.snapshots`;
      return json({ backend: "postgresql", configured: true, reachable: true, snapshotCount: rows[0].count });
    }
    if (url.pathname === "/api/storage/architecture") {
      const requested = url.searchParams.get("snapshot") || "";
      if (requested) return storageArchitecture(requested);
      const sql = db();
      const rows = await sql<JsonObject[]>`
        SELECT snapshot_id FROM ai_profiler.snapshots ORDER BY imported_at DESC LIMIT 1
      `;
      return rows.length ? storageArchitecture(rows[0].snapshot_id) : message("snapshot not found", 404);
    }
    if (url.pathname === "/api/snapshots") return snapshots();
    if (url.pathname === "/api/system-graph") {
      const sql = db();
      const rows = await sql<JsonObject[]>`SELECT sequence_document FROM ai_profiler.snapshots ORDER BY imported_at DESC LIMIT 1`;
      return rows.length ? json(rows[0].sequence_document) : message("snapshot not found", 404);
    }
    if (url.pathname === "/file") return artifactResponse(url);
    if (url.pathname === "/api/agent/ask" && request.method === "POST") {
      return json({
        mode: "llm",
        grounded: false,
        answer: "GigaChat не подключён к автономной UI-песочнице.",
        llmHint: "Для ответов модели подключите API AI Profiler.",
        citations: [],
      });
    }
    const sequenceMatch = url.pathname.match(/^\/api\/snapshots\/([^/]+)\/sequence$/);
    if (sequenceMatch) return sequence(decodeURIComponent(sequenceMatch[1]));
    const viewMatch = url.pathname.match(/^\/api\/snapshots\/([^/]+)\/views\/([^/]+)$/);
    if (viewMatch) return snapshotView(decodeURIComponent(viewMatch[1]), decodeURIComponent(viewMatch[2]));
    const contractMatch = url.pathname.match(/^\/api\/snapshots\/([^/]+)\/contract-detail$/);
    if (contractMatch) {
      return contract(decodeURIComponent(contractMatch[1]), url.searchParams.get("contract_id") || "");
    }
    const journeysMatch = url.pathname.match(/^\/api\/snapshots\/([^/]+)\/field-journeys$/);
    if (journeysMatch) return fieldJourneys(decodeURIComponent(journeysMatch[1]), url);
    if (/^\/api\/snapshots\/[^/]+\/reconstruction-ai-queue$/.test(url.pathname)) {
      return json({ summary: {}, tasks: [], unavailable: true });
    }
    if (url.pathname.startsWith("/api/")) {
      return message("This endpoint requires the AI Profiler backend and is not available in the UI sandbox", 503);
    }
    return null;
  } catch (error) {
    console.error("API request failed", error);
    return message("database request failed", 503);
  }
}
