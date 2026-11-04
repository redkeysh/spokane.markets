import { describe, expect, it } from "vitest";
import { REQUEST_FAILED, settle } from "./settle";

describe("settle", () => {
  it("passes the action's own result through", async () => {
    expect(await settle(Promise.resolve({ ok: false as const, error: "Add the name." }))).toEqual({ ok: false, error: "Add the name." });
    expect(await settle(Promise.resolve({ ok: true as const, id: "v1" }))).toEqual({ ok: true, id: "v1" });
  });

  it("turns a request that throws into a failed result", async () => {
    expect(await settle(Promise.reject(new Error("Failed to fetch")))).toEqual({ ok: false, error: REQUEST_FAILED });
  });
});
