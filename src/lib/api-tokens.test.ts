import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiTokenFindUniqueMock, apiTokenUpdateMock, siteConfigFindUniqueMock } = vi.hoisted(() => ({
  apiTokenFindUniqueMock: vi.fn(),
  apiTokenUpdateMock: vi.fn(),
  siteConfigFindUniqueMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    apiToken: { findUnique: apiTokenFindUniqueMock, update: apiTokenUpdateMock },
    siteConfig: { findUnique: siteConfigFindUniqueMock },
  },
}));

import { API_TOKEN_PREFIX, authenticateApiToken, generateApiToken, hashApiToken } from "./api-tokens";

function tokenRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "tok1",
    name: "Claude",
    access: "READ",
    revokedAt: null,
    expiresAt: null,
    lastUsedAt: new Date(),
    user: { id: "u1", email: "admin@example.com", name: "Admin", role: "ADMIN", accountStatus: "ACTIVE" },
    ...overrides,
  };
}

describe("generateApiToken", () => {
  it("returns a prefixed token whose hash and display prefix match", () => {
    const { token, prefix, tokenHash } = generateApiToken();
    expect(token.startsWith(API_TOKEN_PREFIX)).toBe(true);
    expect(token.length).toBeGreaterThan(40);
    expect(token.startsWith(prefix)).toBe(true);
    expect(tokenHash).toBe(hashApiToken(token));
    expect(tokenHash).not.toContain(token);
  });

  it("never repeats", () => {
    expect(generateApiToken().token).not.toBe(generateApiToken().token);
  });
});

describe("authenticateApiToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    siteConfigFindUniqueMock.mockResolvedValue(null);
  });

  it.each([null, "", "Basic abc", "Bearer", "Bearer not_a_site_token"])(
    "rejects a missing or malformed header (%s) without a lookup",
    async (header) => {
      const result = await authenticateApiToken(header);
      expect(result).toMatchObject({ ok: false, status: 401 });
      expect(apiTokenFindUniqueMock).not.toHaveBeenCalled();
    }
  );

  it("looks the token up by hash, never by plaintext", async () => {
    apiTokenFindUniqueMock.mockResolvedValue(null);
    const { token } = generateApiToken();
    const result = await authenticateApiToken(`Bearer ${token}`);
    expect(result).toMatchObject({ ok: false, status: 401 });
    expect(apiTokenFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: hashApiToken(token) } })
    );
  });

  it("rejects a revoked token", async () => {
    apiTokenFindUniqueMock.mockResolvedValue(tokenRecord({ revokedAt: new Date() }));
    expect(await authenticateApiToken(`Bearer ${generateApiToken().token}`)).toMatchObject({ ok: false, status: 401 });
  });

  it("rejects an expired token", async () => {
    apiTokenFindUniqueMock.mockResolvedValue(tokenRecord({ expiresAt: new Date(Date.now() - 1000) }));
    expect(await authenticateApiToken(`Bearer ${generateApiToken().token}`)).toMatchObject({ ok: false, status: 401 });
  });

  it.each([
    { role: "USER", accountStatus: "ACTIVE" },
    { role: "ADMIN", accountStatus: "SUSPENDED" },
  ])("rejects a token whose owner is no longer an active admin (%o)", async (owner) => {
    apiTokenFindUniqueMock.mockResolvedValue(
      tokenRecord({ user: { id: "u1", email: "a@example.com", name: null, ...owner } })
    );
    expect(await authenticateApiToken(`Bearer ${generateApiToken().token}`)).toMatchObject({ ok: false, status: 403 });
  });

  it("returns the owner and the role's permissions for a valid token", async () => {
    apiTokenFindUniqueMock.mockResolvedValue(tokenRecord({ access: "WRITE" }));
    const result = await authenticateApiToken(`Bearer ${generateApiToken().token}`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.principal).toMatchObject({
      tokenId: "tok1",
      access: "WRITE",
      user: { id: "u1", role: "ADMIN" },
    });
    expect(result.principal.permissions).toContain("admin.listings.manage");
  });

  it("writes lastUsedAt only when the previous write is stale", async () => {
    apiTokenFindUniqueMock.mockResolvedValue(tokenRecord({ lastUsedAt: new Date() }));
    await authenticateApiToken(`Bearer ${generateApiToken().token}`);
    expect(apiTokenUpdateMock).not.toHaveBeenCalled();

    apiTokenFindUniqueMock.mockResolvedValue(tokenRecord({ lastUsedAt: new Date(Date.now() - 60 * 60 * 1000) }));
    await authenticateApiToken(`Bearer ${generateApiToken().token}`);
    expect(apiTokenUpdateMock).toHaveBeenCalledOnce();
  });
});
