import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ClankerClient,
  clankerEnabled,
  hasPersistentSandbox,
  readClankerConfig,
} from "@/lib/providers/adapters/clanker/client";
import { getInfrastructureProvider, providerAvailable, resetProviders, registerProvider, listProviders, unregisterProvider, getProviderById, listProviderIds } from "@/lib/providers/registry";
import { MockInfrastructureProvider } from "@/lib/providers/adapters/mock/mock-provider";
import { ProviderError } from "@/lib/errors";

const ORIGINAL_ENV = { ...process.env };
const BASE_CONFIG = {
  baseUrl: "https://clanker.test",
  accountToken: null,
  sandboxId: null,
  sandboxToken: null,
  timeoutMs: 5_000,
  agent: "clanker-cli",
  workingDir: "/workspace",
};

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  resetProviders();
});

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

describe("ClankerClient error mapping", () => {
  it("maps 401/403 to PROVIDER_AUTH_FAILED", async () => {
    stubFetch(401, { error: "bad key" });
    await expect(new ClankerClient(BASE_CONFIG).createSandbox()).rejects.toMatchObject({
      code: "PROVIDER_AUTH_FAILED",
    });
  });

  it("maps 429 to PROVIDER_RATE_LIMITED", async () => {
    stubFetch(429, {});
    await expect(new ClankerClient(BASE_CONFIG).createSandbox()).rejects.toMatchObject({
      code: "PROVIDER_RATE_LIMITED",
    });
  });

  it("maps 5xx to PROVIDER_UNAVAILABLE", async () => {
    stubFetch(503, {});
    await expect(new ClankerClient(BASE_CONFIG).createSandbox()).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });
  });

  it("maps network failures to PROVIDER_UNAVAILABLE", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(new ClankerClient(BASE_CONFIG).createSandbox()).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });
  });

  it("maps timeouts to PROVIDER_TIMEOUT", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Object.assign(new Error("aborted"), { name: "TimeoutError" })));
    await expect(new ClankerClient(BASE_CONFIG).createSandbox()).rejects.toMatchObject({
      code: "PROVIDER_TIMEOUT",
    });
  });

  it("rejects malformed responses as INVALID_PROVIDER_RESPONSE", async () => {
    stubFetch(200, { unexpected: true });
    await expect(new ClankerClient(BASE_CONFIG).createSandbox()).rejects.toMatchObject({
      code: "INVALID_PROVIDER_RESPONSE",
    });
  });

  it("parses a valid sandbox creation response", async () => {
    stubFetch(200, { box: { id: "sbx-1", token: "tok-1" } });
    const sandbox = await new ClankerClient(BASE_CONFIG).createSandbox();
    expect(sandbox).toEqual({ id: "sbx-1", token: "tok-1" });
  });

  it("sends the account token on sandbox creation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ box: { id: "sbx-2", token: "tok-2" } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new ClankerClient({ ...BASE_CONFIG, accountToken: "acct-key" });
    await client.createSandbox();
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["X-API-Key"]).toBe("acct-key");
  });
});

describe("config helpers", () => {
  it("reads defaults when env is empty", () => {
    const config = readClankerConfig({} as NodeJS.ProcessEnv);
    expect(config.baseUrl).toBe("https://clankercloud.ai");
    expect(config.timeoutMs).toBe(120_000);
    expect(config.agent).toBe("clanker-cli");
  });

  it("clankerEnabled only when CLANKER_MODE=live", () => {
    expect(clankerEnabled({ CLANKER_MODE: "live" } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(clankerEnabled({ CLANKER_MODE: "demo" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(clankerEnabled({} as unknown as NodeJS.ProcessEnv)).toBe(false);
  });

  it("detects persistent sandbox credentials", () => {
    expect(hasPersistentSandbox({ ...BASE_CONFIG, sandboxId: "s", sandboxToken: "t" })).toBe(true);
    expect(hasPersistentSandbox({ ...BASE_CONFIG, sandboxId: "s" })).toBe(false);
  });
});

describe("provider registry", () => {
  it("resolves the demo provider in demo mode", () => {
    process.env.INCIDENTLENS_MODE = "demo";
    const provider = getInfrastructureProvider();
    expect(provider).toBeInstanceOf(MockInfrastructureProvider);
  });

  it("throws PROVIDER_NOT_CONFIGURED in live mode without providers — no silent fallback", () => {
    process.env.INCIDENTLENS_MODE = "live";
    process.env.CLANKER_MODE = "demo";
    let caught: unknown = null;
    try {
      getInfrastructureProvider();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ProviderError);
    expect((caught as ProviderError).code).toBe("PROVIDER_NOT_CONFIGURED");
    expect(providerAvailable()).toBe(false);
  });

  it("registers and retrieves providers", () => {
    const p1 = new MockInfrastructureProvider();
    const p2 = new MockInfrastructureProvider();
    // Create unique IDs for testing
    Object.defineProperty(p1, 'id', { value: 'test-mock-1', writable: true });
    Object.defineProperty(p2, 'id', { value: 'test-mock-2', writable: true });

    registerProvider(p1);
    registerProvider(p2);

    expect(listProviders().length).toBe(2);
    expect(getProviderById('test-mock-1')).toBe(p1);
    expect(getProviderById('test-mock-2')).toBe(p2);
    expect(listProviderIds()).toContain('test-mock-1');
    expect(listProviderIds()).toContain('test-mock-2');
  });

  it("throws on duplicate provider ID", () => {
    const p1 = new MockInfrastructureProvider();
    Object.defineProperty(p1, 'id', { value: 'dup-test', writable: true });
    registerProvider(p1);
    expect(() => registerProvider(p1)).toThrow();
  });

  it("unregisters providers", () => {
    const p1 = new MockInfrastructureProvider();
    Object.defineProperty(p1, 'id', { value: 'unreg-test', writable: true });
    registerProvider(p1);
    expect(unregisterProvider('unreg-test')).toBe(true);
    expect(listProviders().length).toBe(0);
    expect(unregisterProvider('unreg-test')).toBe(false);
  });

  it("resolveProvider returns mock in demo mode", () => {
    process.env.INCIDENTLENS_MODE = "demo";
    const provider = getInfrastructureProvider();
    expect(provider).toBeInstanceOf(MockInfrastructureProvider);
  });
});