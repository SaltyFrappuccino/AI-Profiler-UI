import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { closeDatabase, db } from "./database";

const migrationsRoot = resolve(import.meta.dir, "migrations");

export async function migrationChecksum(contents: string): Promise<string> {
  const bytes = new TextEncoder().encode(contents);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Buffer.from(digest).toString("hex");
}

export async function migrate(): Promise<void> {
  const sql = db({ readOnly: false });
  await sql.unsafe("CREATE SCHEMA IF NOT EXISTS ai_profiler", [], { prepare: false });
  await sql.unsafe(
    "CREATE TABLE IF NOT EXISTS ai_profiler.schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    [],
    { prepare: false },
  );
  await sql.unsafe(
    "ALTER TABLE ai_profiler.schema_migrations ADD COLUMN IF NOT EXISTS checksum text",
    [],
    { prepare: false },
  );
  const applied = new Map(
    (await sql<{ version: string; checksum: string | null }[]>`
      SELECT version, checksum FROM ai_profiler.schema_migrations
    `).map((row) => [row.version, row.checksum]),
  );
  const files = (await readdir(migrationsRoot)).filter((name) => name.endsWith(".sql")).sort();
  for (const fileName of files) {
    const contents = await Bun.file(resolve(migrationsRoot, fileName)).text();
    const checksum = await migrationChecksum(contents);
    if (applied.has(fileName)) {
      const recorded = applied.get(fileName);
      if (recorded && recorded !== checksum) {
        throw new Error(`Applied migration has changed: ${fileName}`);
      }
      if (!recorded) {
        await sql`UPDATE ai_profiler.schema_migrations SET checksum = ${checksum} WHERE version = ${fileName}`;
      }
      continue;
    }
    await sql.begin(async (transaction) => {
      await transaction.unsafe(contents, [], { prepare: false });
      await transaction`
        INSERT INTO ai_profiler.schema_migrations (version, checksum) VALUES (${fileName}, ${checksum})
      `;
    });
    console.log(`Applied ${fileName}`);
  }
}

if (import.meta.main) {
  try {
    await migrate();
  } finally {
    await closeDatabase();
  }
}
