import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { closeDatabase, db } from "./database";

const migrationsRoot = resolve(import.meta.dir, "migrations");

export async function migrate(): Promise<void> {
  const sql = db();
  await sql.unsafe("CREATE SCHEMA IF NOT EXISTS ai_profiler", [], { prepare: false });
  await sql.unsafe(
    "CREATE TABLE IF NOT EXISTS ai_profiler.schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    [],
    { prepare: false },
  );
  const applied = new Set(
    (await sql<{ version: string }[]>`SELECT version FROM ai_profiler.schema_migrations`).map((row) => row.version),
  );
  const files = (await readdir(migrationsRoot)).filter((name) => name.endsWith(".sql")).sort();
  for (const fileName of files) {
    if (applied.has(fileName)) continue;
    const contents = await Bun.file(resolve(migrationsRoot, fileName)).text();
    await sql.begin(async (transaction) => {
      await transaction.unsafe(contents, [], { prepare: false });
      await transaction`INSERT INTO ai_profiler.schema_migrations (version) VALUES (${fileName})`;
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
