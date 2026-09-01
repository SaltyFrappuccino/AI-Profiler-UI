import postgres, { type Sql } from "postgres";

export const databaseUrl = () =>
  Bun.env.DATABASE_URL || "postgres://ai_profiler:ai_profiler@127.0.0.1:54329/ai_profiler";

let client: Sql | undefined;
let clientReadOnly: boolean | undefined;

export interface DatabaseAccess {
  readOnly?: boolean;
}

export function databaseConnectionParameters(readOnly: boolean) {
  return {
    application_name: Bun.env.DATABASE_APPLICATION_NAME || (readOnly ? "ai-profiler-ui" : "ai-profiler-report-loader"),
    default_transaction_read_only: readOnly,
  };
}

export function db({ readOnly = true }: DatabaseAccess = {}): Sql {
  if (client && clientReadOnly !== readOnly) {
    throw new Error("Database connection mode cannot change before closeDatabase() is called");
  }
  if (!client) {
    client = postgres(databaseUrl(), {
      max: Number.parseInt(Bun.env.DATABASE_POOL_SIZE || "10", 10),
      idle_timeout: 20,
      connect_timeout: 10,
      connection: databaseConnectionParameters(readOnly),
    });
    clientReadOnly = readOnly;
  }
  return client;
}

export async function closeDatabase(): Promise<void> {
  if (client) {
    await client.end({ timeout: 5 });
    client = undefined;
    clientReadOnly = undefined;
  }
}
