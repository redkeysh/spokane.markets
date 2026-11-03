import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(() => new Headers()),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import { auth } from "@/lib/auth";
import { requireAuth } from "./auth-utils";

type MockSession = {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    accountStatus?: "ACTIVE" | "SUSPENDED" | "BANNED" | "DEACTIVATED";
  };
  session: { id: string };
};

const mockSession = (
  accountStatus: MockSession["user"]["accountStatus"] = "ACTIVE"
): MockSession => ({
  user: {
    id: "u1",
    name: "Test User",
    email: "test@test.com",
    role: "USER",
    accountStatus,
  },
  session: { id: "s1" },
});

const mockSessionWithoutStatus = (): MockSession => ({
  user: {
    id: "u1",
    name: "Test User",
    email: "test@test.com",
    role: "USER",
  },
  session: { id: "s1" },
});

describe("requireAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns session when account is ACTIVE", async () => {
    vi.mocked(auth.api.getSession, { partial: true, deep: true }).mockResolvedValue(mockSession("ACTIVE"));
    const session = await requireAuth();
    expect(session.user.email).toBe("test@test.com");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects to unauthorized when accountStatus is missing", async () => {
    vi.mocked(auth.api.getSession, { partial: true, deep: true }).mockResolvedValue(mockSessionWithoutStatus());
    await expect(requireAuth()).rejects.toThrow("REDIRECT:/unauthorized");
    expect(redirectMock).toHaveBeenCalledWith("/unauthorized");
  });

  it("redirects to unauthorized when account is SUSPENDED", async () => {
    vi.mocked(auth.api.getSession, { partial: true, deep: true }).mockResolvedValue(mockSession("SUSPENDED"));
    await expect(requireAuth()).rejects.toThrow("REDIRECT:/unauthorized");
    expect(redirectMock).toHaveBeenCalledWith("/unauthorized");
  });
});
