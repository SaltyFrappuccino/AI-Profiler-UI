import postgres, { type Sql } from "postgres";

export const databaseUrl = () =>
  Bun.env.DATABASE_URL || "postgres://ai_profiler:ai_profiler@127.0.0.1:54329/ai_profiler";

let client: Sql | undefined;

export function db(): Sql {
  if (!client) {
    client = postgres(databaseUrl(), {
      max: Number.parseInt(Bun.env.DATABASE_POOL_SIZE || "10", 10),
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return client;
}

export async function closeDatabase(): Promise<void> {
  if (client) {
    await client.end({ timeout: 5 });
    client = undefined;
  }
}
