import { db } from "../db/database";
import { json, message } from "./responses";

export function boundedIntegerParam(
  params: URLSearchParams,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = params.get(name);
  if (raw === null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

export async function fieldJourneys(snapshotId: string, url: URL): Promise<Response> {
  const field = (url.searchParams.get("field") || "").trim();
  if (!field) return message("field is required", 422);
  const direction = url.searchParams.get("direction") === "upstream" ? "upstream" : "downstream";
  const service = (url.searchParams.get("service") || "").trim();
  const confirmedOnly = url.searchParams.get("confirmed_only") !== "false";
  const depth = boundedIntegerParam(url.searchParams, "depth", 8, 1, 20);
  const limit = boundedIntegerParam(url.searchParams, "limit", 100, 1, 500);
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
