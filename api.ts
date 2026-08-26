import { basename, resolve, sep } from "node:path";
import { db } from "./db/database";
import { contractDetail } from "./db/projections";

type JsonObject = Record<string, any>;

const uiRoot = resolve(import.meta.dir);

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

function message(detail: string, status: number): Response {
  return json({ detail }, status);
}

function artifactHref(snapshotId: string, fileName: string): string {
  if (!fileName) return "";
  const query = new URLSearchParams({ snapshot: snapshotId, path: fileName });
  return `/file?${query.toString()}`;
}

function attachArtifactLinks(snapshotId: string, contract: JsonObject): JsonObject {
  const result = contractDetail(contract);
  const mapping = result.mapping || {};
  mapping.href = artifactHref(snapshotId, mapping.file || "");
  result.mapping = mapping;
  result.dataSurf = mapping;
  return result;
}

async function snapshots(): Promise<Response> {
  const sql = db();
  const rows = await sql<JsonObject[]>`
    SELECT snapshot_id, name, source_file, imported_at, summary
    FROM ai_profiler.snapshots
    ORDER BY imported_at DESC
    LIMIT 100
  `;
  return json({
    items: rows.map((row) => ({
      id: row.snapshot_id,
      name: row.name,
      path: row.source_file,
      storage: "postgresql",
      importedAt: row.imported_at,
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

async function fieldJourneys(snapshotId: string, url: URL): Promise<Response> {
  const field = (url.searchParams.get("field") || "").trim();
  if (!field) return message("field is required", 422);
  const direction = url.searchParams.get("direction") === "upstream" ? "upstream" : "downstream";
  const service = (url.searchParams.get("service") || "").trim();
  const confirmedOnly = url.searchParams.get("confirmed_only") !== "false";
  const depth = Math.min(20, Math.max(1, Number.parseInt(url.searchParams.get("depth") || "8", 10)));
  const limit = Math.min(500, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "100", 10)));
  const downstream = direction === "downstream";
  const seedService = downstream ? "source_service" : "target_service";
  const nextJoin = downstream
    ? "n.source_service = w.target_service AND n.field_name = w.field_name"
    : "n.target_service = w.source_service AND n.field_name = w.field_name";
  const nextNode = downstream
    ? "n.target_service || '::' || COALESCE(n.target_paths->>0, n.field_name)"
    : "n.source_service || '::' || COALESCE(n.source_paths->>0, n.field_name)";
  const startNode = downstream
    ? "h.source_service || '::' || COALESCE(h.source_paths->>0, h.field_name)"
    : "h.target_service || '::' || COALESCE(h.target_paths->>0, h.field_name)";
  const endNode = downstream
    ? "h.target_service || '::' || COALESCE(h.target_paths->>0, h.field_name)"
    : "h.source_service || '::' || COALESCE(h.source_paths->>0, h.field_name)";
  const sql = db();
  const pattern = `%${field}%`;
  const rows = await sql.unsafe(
    `WITH RECURSIVE walk AS (
      SELECT h.source_service, h.target_service, h.field_name, h.source_paths, h.target_paths,
             h.proof_level, h.confirmed, 1 AS depth,
             ARRAY[${startNode}, ${endNode}] AS visited,
             jsonb_build_array(h.payload) AS path
      FROM ai_profiler.field_links h
      WHERE h.snapshot_id = $1
        AND (h.field_name ILIKE $2 OR h.source_paths::text ILIKE $2 OR h.target_paths::text ILIKE $2)
        AND ($3 = '' OR h.${seedService} = $3)
        AND (NOT $4 OR h.confirmed)
      UNION ALL
      SELECT n.source_service, n.target_service, n.field_name, n.source_paths, n.target_paths,
             n.proof_level, n.confirmed, w.depth + 1,
             w.visited || (${nextNode}),
             w.path || jsonb_build_array(n.payload)
      FROM walk w
      JOIN ai_profiler.field_links n ON n.snapshot_id = $1 AND ${nextJoin}
      WHERE w.depth < $5 AND (NOT $4 OR n.confirmed) AND NOT (${nextNode} = ANY(w.visited))
    )
    SELECT depth, path AS steps FROM walk ORDER BY depth DESC LIMIT $6`,
    [snapshotId, pattern, service, confirmedOnly, depth, limit],
  );
  return json({
    items: rows,
    total: rows.length,
    direction,
    maxDepth: depth,
    storage: "postgresql_recursive_cte",
  });
}

async function artifact(url: URL): Promise<Response> {
  const snapshotId = (url.searchParams.get("snapshot") || "").trim();
  const requestedPath = (url.searchParams.get("path") || "").trim();
  if (!requestedPath) return message("path is required", 422);
  const sql = db();
  const rows = snapshotId
    ? await sql<JsonObject[]>`
        SELECT relative_path, media_type FROM ai_profiler.artifacts
        WHERE snapshot_id = ${snapshotId}
          AND (relative_path = ${requestedPath} OR file_name = ${basename(requestedPath)})
        ORDER BY relative_path = ${requestedPath} DESC LIMIT 1
      `
    : await sql<JsonObject[]>`
        SELECT artifacts.relative_path, artifacts.media_type
        FROM ai_profiler.artifacts artifacts
        JOIN ai_profiler.snapshots snapshots USING (snapshot_id)
        WHERE artifacts.relative_path = ${requestedPath} OR artifacts.file_name = ${basename(requestedPath)}
        ORDER BY snapshots.imported_at DESC LIMIT 1
      `;
  if (!rows.length) return message("artifact not found", 404);
  const filePath = resolve(uiRoot, rows[0].relative_path);
  if (filePath !== uiRoot && !filePath.startsWith(`${uiRoot}${sep}`)) return message("invalid artifact path", 400);
  const file = Bun.file(filePath);
  if (!(await file.exists())) return message("artifact file is unavailable", 404);
  return new Response(file, {
    headers: {
      "content-type": rows[0].media_type,
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(basename(filePath))}`,
    },
  });
}

export async function api(request: Request, url: URL): Promise<Response | null> {
  try {
    if (url.pathname === "/api/storage/health") {
      const sql = db();
      const rows = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM ai_profiler.snapshots`;
      return json({ backend: "postgresql", configured: true, reachable: true, snapshotCount: rows[0].count });
    }
    if (url.pathname === "/api/snapshots") return snapshots();
    if (url.pathname === "/api/system-graph") {
      const sql = db();
      const rows = await sql<JsonObject[]>`SELECT sequence_document FROM ai_profiler.snapshots ORDER BY imported_at DESC LIMIT 1`;
      return rows.length ? json(rows[0].sequence_document) : message("snapshot not found", 404);
    }
    if (url.pathname === "/file") return artifact(url);
    if (url.pathname === "/api/agent/ask" && request.method === "POST") {
      return json({
        mode: "facts",
        answer: "В песочнице доступен просмотр импортированного отчёта. AI Profiler и GigaChat в эту поставку не входят.",
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
    if (url.pathname.startsWith("/api/")) {
      return message("This endpoint requires the AI Profiler backend and is not available in the UI sandbox", 503);
    }
    return null;
  } catch (error) {
    console.error(error);
    return message(error instanceof Error ? error.message : "database request failed", 503);
  }
}
