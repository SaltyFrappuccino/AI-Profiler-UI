import { basename, resolve, sep } from "node:path";
import { db } from "../db/database";
import { contractDetail } from "../db/projections";
import { json, message } from "./responses";

type JsonObject = Record<string, any>;

const uiRoot = resolve(import.meta.dir, "..");

export function artifactHref(snapshotId: string, fileName: string): string {
  if (!fileName) return "";
  const query = new URLSearchParams({ snapshot: snapshotId, path: fileName });
  return `/file?${query.toString()}`;
}

export function attachArtifactLinks(snapshotId: string, contract: JsonObject): JsonObject {
  const result = contractDetail(contract);
  const mapping = result.mapping || {};
  mapping.href = artifactHref(snapshotId, mapping.file || "");
  result.mapping = mapping;
  result.dataSurf = mapping;
  return result;
}

export function safeArtifactPath(relativePath: string): string | null {
  const filePath = resolve(uiRoot, relativePath);
  return filePath === uiRoot || filePath.startsWith(`${uiRoot}${sep}`) ? filePath : null;
}

export async function artifactResponse(url: URL): Promise<Response> {
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
  const filePath = safeArtifactPath(rows[0].relative_path);
  if (!filePath) return message("invalid artifact path", 400);
  const file = Bun.file(filePath);
  if (!(await file.exists())) return message("artifact file is unavailable", 404);
  return new Response(file, {
    headers: {
      "content-type": rows[0].media_type,
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(basename(filePath))}`,
    },
  });
}
