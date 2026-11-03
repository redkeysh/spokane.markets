import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { MAX_BATCH_SIZE, SUPPORTED_PROTOCOL_VERSIONS, ToolError, defineTool, handleMcpPayload } from "./protocol";

type Ctx = { canWrite: boolean };

const server = { name: "test-server", version: "1.0.0", instructions: "Test instructions." };

const tools = [
  defineTool({
    name: "echo",
    title: "Echo",
    description: "Echoes its input.",
    readOnly: true,
    input: z.object({ text: z.string(), times: z.number().int().min(1).default(1) }),
    unavailableReason: () => null,
    run: async ({ text, times }) => ({ echoed: text.repeat(times) }),
  }),
  defineTool({
    name: "write_thing",
    title: "Write",
    description: "Needs write access.",
    readOnly: false,
    input: z.object({}),
    unavailableReason: (ctx: Ctx) => (ctx.canWrite ? null : "Read-only token."),
    run: async () => ({ wrote: true }),
  }),
  defineTool({
    name: "fails",
    title: "Fails",
    description: "Always throws.",
    readOnly: true,
    input: z.object({ known: z.boolean() }),
    unavailableReason: () => null,
    run: async ({ known }) => {
      throw known ? new ToolError("Submission not found.") : new Error("database exploded at 10.0.0.5");
    },
  }),
];

function call(payload: unknown, ctx: Ctx = { canWrite: false }) {
  return handleMcpPayload(payload, ctx, tools, server);
}

function rpc(method: string, params?: unknown, id: string | number = 1) {
  return { jsonrpc: "2.0", id, method, params };
}

describe("handleMcpPayload", () => {
  it("negotiates a supported protocol version and falls back to the newest", async () => {
    const supported = await call(rpc("initialize", { protocolVersion: "2025-06-18" }));
    expect(supported.body).toMatchObject({
      result: {
        protocolVersion: "2025-06-18",
        serverInfo: { name: "test-server", version: "1.0.0" },
        capabilities: { tools: {} },
        instructions: "Test instructions.",
      },
    });

    const unknown = await call(rpc("initialize", { protocolVersion: "1999-01-01" }));
    expect(unknown.body).toMatchObject({ result: { protocolVersion: SUPPORTED_PROTOCOL_VERSIONS[0] } });
  });

  it("answers notifications with 202 and no body", async () => {
    expect(await call({ jsonrpc: "2.0", method: "notifications/initialized" })).toEqual({ status: 202 });
  });

  it("returns method-not-found for unknown methods", async () => {
    const res = await call(rpc("resources/list"));
    expect(res.body).toMatchObject({ error: { code: -32601 } });
  });

  it("rejects malformed requests and empty batches", async () => {
    expect((await call("nope")).body).toMatchObject({ error: { code: -32600 } });
    expect((await call({ id: 1, method: "ping" })).body).toMatchObject({ error: { code: -32600 } });
    expect(await call([])).toMatchObject({ status: 400 });
  });

  it("answers a batch with an array of responses", async () => {
    const res = await call([rpc("ping", undefined, 1), { jsonrpc: "2.0", method: "notifications/x" }, rpc("ping", undefined, 2)]);
    expect(res.body).toEqual([
      { jsonrpc: "2.0", id: 1, result: {} },
      { jsonrpc: "2.0", id: 2, result: {} },
    ]);
  });

  it("rejects a batch over the size cap", async () => {
    const batch = Array.from({ length: MAX_BATCH_SIZE + 1 }, (_, i) => rpc("ping", undefined, i));
    expect(await call(batch)).toMatchObject({ status: 400, body: { error: { code: -32600 } } });
  });

  it("lists only the tools the caller can use, with JSON Schema input", async () => {
    const readOnly = await call(rpc("tools/list"));
    const names = (readOnly.body as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name);
    expect(names).toEqual(["echo", "fails"]);

    const writer = await call(rpc("tools/list"), { canWrite: true });
    const writerTools = (writer.body as { result: { tools: { name: string; inputSchema: Record<string, unknown> }[] } })
      .result.tools;
    expect(writerTools.map((t) => t.name)).toContain("write_thing");
    const echo = writerTools.find((t) => t.name === "echo")!;
    expect(echo.inputSchema).toMatchObject({ type: "object", required: ["text"] });
    expect(echo.inputSchema).not.toHaveProperty("$schema");
  });

  it("calls a tool with validated, defaulted arguments", async () => {
    const res = await call(rpc("tools/call", { name: "echo", arguments: { text: "hi" } }));
    const result = (res.body as { result: { content: { text: string }[]; isError?: boolean } }).result;
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual({ echoed: "hi" });
  });

  it("reports invalid arguments as a tool error", async () => {
    const res = await call(rpc("tools/call", { name: "echo", arguments: { text: 5 } }));
    expect(res.body).toMatchObject({ result: { isError: true } });
    expect(JSON.stringify(res.body)).toContain("Invalid arguments");
  });

  it("refuses a tool the caller cannot use, even when called directly", async () => {
    const res = await call(rpc("tools/call", { name: "write_thing", arguments: {} }));
    expect(res.body).toMatchObject({
      result: { isError: true, content: [{ type: "text", text: "Read-only token." }] },
    });
  });

  it("shows ToolError messages but hides unexpected errors", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const known = await call(rpc("tools/call", { name: "fails", arguments: { known: true } }));
    expect(JSON.stringify(known.body)).toContain("Submission not found.");

    const unknown = await call(rpc("tools/call", { name: "fails", arguments: { known: false } }));
    expect(unknown.body).toMatchObject({ result: { isError: true } });
    expect(JSON.stringify(unknown.body)).not.toContain("10.0.0.5");
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("returns invalid-params for an unknown tool", async () => {
    const res = await call(rpc("tools/call", { name: "nope" }));
    expect(res.body).toMatchObject({ error: { code: -32602 } });
  });
});
