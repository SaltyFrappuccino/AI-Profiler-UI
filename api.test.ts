import { describe, expect, test } from "bun:test";
import { api } from "./api";

describe("sandbox API capabilities", () => {
  test("declares the PostgreSQL read-only delivery profile", async () => {
    const url = new URL("http://localhost/api/capabilities");
    const response = await api(new Request(url), url);

    expect(response).not.toBeNull();
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({
      profile: "sandbox-readonly",
      storage: ["postgresql"],
      features: {
        snapshotRead: true,
        reportRuns: false,
        groundedAgent: false,
        llmAgent: false,
        reconstructionVerification: false,
        exportPackages: false,
        datasurfPreview: false,
      },
    });
  });

  test("rejects unsupported methods without opening a database connection", async () => {
    const capabilities = new URL("http://localhost/api/capabilities");
    const capabilitiesResponse = await api(new Request(capabilities, { method: "POST" }), capabilities);
    expect(capabilitiesResponse?.status).toBe(405);
    expect(capabilitiesResponse?.headers.get("allow")).toBe("GET");

    const agent = new URL("http://localhost/api/agent/ask");
    const agentResponse = await api(new Request(agent), agent);
    expect(agentResponse?.status).toBe(405);
    expect(agentResponse?.headers.get("allow")).toBe("POST");
  });

  test("exposes a database-independent liveness endpoint", async () => {
    const url = new URL("http://localhost/api/health/live");
    const response = await api(new Request(url), url);

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ status: "ok", service: "ai-profiler-ui" });
  });
});
