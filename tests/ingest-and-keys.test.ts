import { describe, expect, it, beforeAll, afterAll } from "vitest";

import { db } from "@/lib/db";
import { normalizeAlert, incidentWebhookSchema, mapSeverity } from "@/lib/ingest";
import { createApiKey, verifyApiKey, revokeApiKey, rotateApiKey, listApiKeys, hashApiKey } from "@/lib/services/api-keys";

const workspaceId = "ws-test";
const workspace2Id = "ws-other";

beforeAll(async () => {
  const now = new Date().toISOString();
  await db()
    .prepare("INSERT INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)")
    .run(workspaceId, "Test workspace", "test-workspace", now);
  await db()
    .prepare("INSERT INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)")
    .run(workspace2Id, "Other workspace", "other-workspace", now);
});

afterAll(async () => {
  await db().prepare("DELETE FROM api_keys WHERE workspace_id IN (?, ?)").run(workspaceId, workspace2Id);
  await db().prepare("DELETE FROM workspaces WHERE id IN (?, ?)").run(workspaceId, workspace2Id);
});

describe("API keys", () => {
  it("creates a key whose raw secret is returned exactly once", async () => {
    const { row, secret } = await createApiKey(workspaceId, "test key");
    expect(row.key_prefix).toMatch(/^il_[0-9a-f]{8}$/);
    expect(secret).toMatch(/^il_[0-9a-f]{8}_[A-Za-z0-9_-]{32,}$/);
  });

  it("never stores the raw key — only its hash", async () => {
    const { row, secret } = await createApiKey(workspaceId, "hash test");
    const stored = (await db()
      .prepare("SELECT key_hash FROM api_keys WHERE id = ?")
      .get(row.id)) as { key_hash: string };
    expect(stored.key_hash).toBe(hashApiKey(secret));
    expect(stored.key_hash).not.toContain(secret.slice(0, 8));
  });

  it("verifies a valid key", async () => {
    const { secret } = await createApiKey(workspaceId, "verify test");
    const key = await verifyApiKey(secret);
    expect(key?.name).toBe("verify test");
    expect(key?.last_used_at).not.toBeNull();
  });

  it("rejects revoked keys", async () => {
    const { row, secret } = await createApiKey(workspaceId, "revoke test");
    await revokeApiKey(row.id);
    expect(await verifyApiKey(secret)).toBeNull();
  });

  it("rotation revokes the old key and issues a new one", async () => {
    const { row, secret } = await createApiKey(workspaceId, "rotate test");
    const rotated = await rotateApiKey(row.id);
    expect(rotated).not.toBeNull();
    expect(rotated!.secret).not.toBe(secret);
    expect(await verifyApiKey(secret)).toBeNull();
    expect((await verifyApiKey(rotated!.secret))?.id).toBe(rotated!.row.id);
  });

  it("lists only keys of the workspace", async () => {
    const before = (await listApiKeys(workspaceId)).length;
    await createApiKey(workspaceId, "list test");
    await createApiKey("ws-other", "other workspace key");
    expect((await listApiKeys(workspaceId)).length).toBe(before + 1);
  });
});

describe("alert normalization", () => {
  it("maps Prometheus-style payloads", () => {
    const alert = normalizeAlert({
      alertname: "HighErrorRate",
      service: "checkout-api",
      severity: "critical",
      startsAt: "2026-08-17T08:00:00Z",
      description: "Error rate above threshold",
      event_id: "evt-123",
    });
    expect(alert).not.toBeNull();
    expect(alert!.title).toBe("HighErrorRate");
    expect(alert!.service).toBe("checkout-api");
    expect(alert!.severity).toBe("SEV-1");
    expect(alert!.idempotencyKey).toBe("evt-123");
  });

  it("maps DataDog-style payloads (component / priority / event_time)", () => {
    const alert = normalizeAlert({
      title: "Latency spike",
      component: "search",
      priority: "P2",
      event_time: 1_760_000_000_000,
    });
    expect(alert).not.toBeNull();
    expect(alert!.service).toBe("search");
    expect(alert!.severity).toBe("SEV-3");
    expect(alert!.startedAt).toBeDefined();
  });

  it("maps the canonical IncidentLens schema", () => {
    const parsed = incidentWebhookSchema.safeParse({
      title: "API elevated 5xx",
      service: "api-gateway",
      severity: "SEV-2",
      description: "5xx rate above threshold",
      startedAt: "2026-08-17T09:00:00Z",
      environment: "production",
      idempotencyKey: "idem-1",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.service).toBe("api-gateway");
      expect(parsed.data.idempotencyKey).toBe("idem-1");
    }
  });

  it("returns null when no service/component can be mapped", () => {
    expect(normalizeAlert({ note: "unrelated" })).toBeNull();
    expect(normalizeAlert(null)).toBeNull();
    expect(normalizeAlert([])).toBeNull();
    expect(normalizeAlert("string")).toBeNull();
  });

  it("maps severity vocabulary to SEV levels", () => {
    expect(mapSeverity("critical")).toBe("SEV-1");
    expect(mapSeverity("P0")).toBe("SEV-1");
    expect(mapSeverity("warning")).toBe("SEV-3");
    expect(mapSeverity("info")).toBe("SEV-4");
    expect(mapSeverity("weird")).toBe("SEV-3");
  });

  it("defaults missing fields safely", () => {
    const alert = normalizeAlert({ service: "cart", severity: "SEV-4" });
    expect(alert).not.toBeNull();
    expect(alert!.title).toContain("cart");
    expect(alert!.description).toBeDefined();
    expect(alert!.startedAt).toBeDefined();
  });
});