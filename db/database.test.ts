import { expect, test } from "bun:test";
import { databaseConnectionParameters } from "./database";
import { migrationChecksum } from "./migrate";

test("UI and report loader use distinct PostgreSQL session modes", () => {
  expect(databaseConnectionParameters(true)).toEqual({
    application_name: "ai-profiler-ui",
    default_transaction_read_only: true,
  });
  expect(databaseConnectionParameters(false)).toEqual({
    application_name: "ai-profiler-report-loader",
    default_transaction_read_only: false,
  });
});

test("migration checksums are stable and content-sensitive", async () => {
  expect(await migrationChecksum("SELECT 1;\n")).toBe(await migrationChecksum("SELECT 1;\n"));
  expect(await migrationChecksum("SELECT 1;\n")).not.toBe(await migrationChecksum("SELECT 2;\n"));
});
