import { describe, expect, test } from "bun:test";

await import("./architecture_state.js");

const architectureState = (globalThis as typeof globalThis & {
  AIProfilerArchitectureState: {
    connection: (data?: Record<string, unknown>) => {
      connected: boolean;
      label: string;
      profileLabel: string;
    };
  };
}).AIProfilerArchitectureState;

describe("architecture storage state", () => {
  test("reports a live PostgreSQL projection only with runtime evidence", () => {
    const state = architectureState.connection({
      storage: "postgresql",
      available: true,
      runtime: { server_version: "16.15" },
    });

    expect(state.connected).toBe(true);
    expect(state.label).toBe("Подключено");
  });

  test("does not present filesystem data as a live database", () => {
    const state = architectureState.connection({
      storage: "filesystem",
      available: false,
      unavailableReason: "postgresql_not_configured",
    });

    expect(state.connected).toBe(false);
    expect(state.label).toBe("Не настроено");
    expect(state.profileLabel).toBe("Файловый профиль");
  });

  test("distinguishes an unreachable configured database", () => {
    const state = architectureState.connection({
      storage: "filesystem",
      available: false,
      unavailableReason: "postgresql_unreachable",
    });

    expect(state.connected).toBe(false);
    expect(state.label).toBe("Нет соединения");
  });
});
