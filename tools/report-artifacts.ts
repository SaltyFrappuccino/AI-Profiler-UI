import { existsSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { slug } from "./report-source";

export type ArtifactRow = Record<string, any>;

export function deliveryRelativePath(filePath: string): string {
  const deliveryRoot = resolve(import.meta.dir, "..");
  const relativePath = relative(deliveryRoot, filePath);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error(`Artifact is outside the UI delivery root: ${filePath}`);
  }
  return relativePath.split(sep).join("/");
}

export async function artifactRows(snapshotId: string, reportPath: string): Promise<ArtifactRow[]> {
  const root = dirname(reportPath);
  const artifactRoot = resolve(root, "datasurf", "contracts");
  if (!existsSync(artifactRoot)) return [];
  const rows: ArtifactRow[] = [];
  const glob = new Bun.Glob("**/*");
  for await (const item of glob.scan({ cwd: artifactRoot, onlyFiles: true })) {
    const fullPath = resolve(artifactRoot, item);
    const file = Bun.file(fullPath);
    const extension = item.toLowerCase().split(".").pop();
    if (!new Set(["xlsx", "xls", "csv", "json"]).has(extension || "")) continue;
    const relativePath = deliveryRelativePath(fullPath);
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
