import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSessionToken, verifySession } from "@/lib/auth/session";
import { hasPermission, normalizeRole } from "@/lib/auth/permissions";

describe("password hashing", () => {
  it("hashes and verifies a password", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain("horse");
    expect(verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects wrong passwords", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(verifyPassword("wrong", hash)).toBe(false);
  });

  it("is salted — two hashes of the same password differ", () => {
    const a = hashPassword("same-password");
    const b = hashPassword("same-password");
    expect(a).not.toBe(b);
    expect(verifyPassword("same-password", a)).toBe(true);
    expect(verifyPassword("same-password", b)).toBe(true);
  });
});

describe("session tokens", () => {
  it("signs and verifies a token", () => {
    const token = createSessionToken("u-test");
    const session = verifySession(token);
    expect(session?.userId).toBe("u-test");
  });

  it("rejects tampered tokens", () => {
    const token = createSessionToken("u-test");
    const tampered = token.slice(0, -2) + (token.endsWith("AA") ? "BB" : "AA");
    expect(verifySession(tampered)).toBeNull();
  });

  it("rejects garbage", () => {
    expect(verifySession("not-a-token")).toBeNull();
    expect(verifySession("")).toBeNull();
    expect(verifySession(undefined)).toBeNull();
  });
});

describe("permissions", () => {
  it("normalizes unknown roles to viewer", () => {
    expect(normalizeRole("root")).toBe("viewer");
  });

  it("grants admins every permission", () => {
    expect(hasPermission("admin", "plan.execute")).toBe(true);
    expect(hasPermission("admin", "settings.manage")).toBe(true);
    expect(hasPermission("admin", "api_keys.manage")).toBe(true);
  });

  it("grants engineers execution but not settings", () => {
    expect(hasPermission("engineer", "plan.execute")).toBe(true);
    expect(hasPermission("engineer", "settings.manage")).toBe(false);
    expect(hasPermission("engineer", "api_keys.manage")).toBe(false);
  });

  it("keeps viewers read-only", () => {
    expect(hasPermission("viewer", "incidents.view")).toBe(true);
    expect(hasPermission("viewer", "audit.view")).toBe(true);
    expect(hasPermission("viewer", "plan.approve")).toBe(false);
    expect(hasPermission("viewer", "incidents.create")).toBe(false);
  });
});