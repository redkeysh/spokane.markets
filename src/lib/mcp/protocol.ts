import { z } from "zod";

/** Newest first; the first entry is offered when a client asks for an unknown version. */
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];

/** The rate limit counts HTTP requests, so a batch is capped to keep one request from carrying many tool calls. */
export const MAX_BATCH_SIZE = 20;

/** A message the tool can show the caller as-is (bad input, missing record, rule violation). */
export class ToolError extends Error {}

type ToolOutcome = { isError: false; data: unknown } | { isError: true; text: string };

export type McpTool<Ctx> = {
  name: string;
  title: string;
  description: string;
  readOnly: boolean;
  destructive: boolean;
  inputSchema: Record<string, unknown>;
  /** null when the caller may use the tool, otherwise the reason it cannot. */
  unavailableReason: (ctx: Ctx) => string | null;
  call: (rawArgs: unknown, ctx: Ctx) => Promise<ToolOutcome>;
};

export function defineTool<S extends z.ZodType, Ctx>(def: {
  name: string;
  title: string;
  description: string;
  readOnly: boolean;
  destructive?: boolean;
  input: S;
  unavailableReason: (ctx: Ctx) => string | null;
  run: (args: z.infer<S>, ctx: Ctx) => Promise<unknown>;
}): McpTool<Ctx> {
  const inputSchema = z.toJSONSchema(def.input, { io: "input" }) as Record<string, unknown>;
  delete inputSchema.$schema;
  return {
    name: def.name,
    title: def.title,
    description: def.description,
    readOnly: def.readOnly,
    destructive: def.destructive ?? false,
    inputSchema,
    unavailableReason: def.unavailableReason,
    call: async (rawArgs, ctx) => {
      const parsed = def.input.safeParse(rawArgs ?? {});
      if (!parsed.success) {
        return { isError: true, text: `Invalid arguments:\n${z.prettifyError(parsed.error)}` };
      }
      try {
        return { isError: false, data: await def.run(parsed.data, ctx) };
      } catch (err) {
        if (err instanceof ToolError) return { isError: true, text: err.message };
        console.error(`[mcp] tool ${def.name} failed:`, err);
        return { isError: true, text: "The tool failed unexpectedly. The error was logged on the server." };
      }
    },
  };
}

export type ServerInfo = { name: string; version: string; instructions: string };

type JsonRpcId = string | number;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is JsonRpcId {
  return typeof value === "string" || typeof value === "number";
}

export function rpcError(id: JsonRpcId | null, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}

function rpcResult(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

function describeTool<Ctx>(tool: McpTool<Ctx>) {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: {
      title: tool.title,
      readOnlyHint: tool.readOnly,
      destructiveHint: tool.destructive,
      openWorldHint: false,
    },
  };
}

async function handleMessage<Ctx>(
  message: unknown,
  ctx: Ctx,
  tools: McpTool<Ctx>[],
  server: ServerInfo
) {
  if (!isRecord(message)) return rpcError(null, -32600, "Invalid Request");
  // Client responses and notifications get no reply.
  if ("result" in message || "error" in message) return null;
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return rpcError(isId(message.id) ? message.id : null, -32600, "Invalid Request");
  }
  if (!("id" in message)) return null;
  if (!isId(message.id)) return rpcError(null, -32600, "Invalid Request");

  const id = message.id;
  const params = isRecord(message.params) ? message.params : {};

  switch (message.method) {
    case "initialize": {
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      return rpcResult(id, {
        protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
          ? requested
          : SUPPORTED_PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: server.name, version: server.version },
        instructions: server.instructions,
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, {
        tools: tools.filter((t) => t.unavailableReason(ctx) === null).map(describeTool),
      });
    case "tools/call": {
      const tool = tools.find((t) => t.name === params.name);
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${String(params.name)}`);
      const reason = tool.unavailableReason(ctx);
      if (reason) {
        return rpcResult(id, { content: [{ type: "text", text: reason }], isError: true });
      }
      const outcome = await tool.call(params.arguments, ctx);
      return rpcResult(
        id,
        outcome.isError
          ? { content: [{ type: "text", text: outcome.text }], isError: true }
          : { content: [{ type: "text", text: JSON.stringify(outcome.data, null, 2) }] }
      );
    }
    default:
      return rpcError(id, -32601, `Method not found: ${message.method}`);
  }
}

/**
 * Handles one Streamable HTTP POST body (a JSON-RPC message or a batch) and
 * returns the HTTP status and JSON body. Only notifications -> 202 with no body.
 */
export async function handleMcpPayload<Ctx>(
  payload: unknown,
  ctx: Ctx,
  tools: McpTool<Ctx>[],
  server: ServerInfo
): Promise<{ status: number; body?: unknown }> {
  const messages = Array.isArray(payload) ? payload : [payload];
  if (messages.length === 0) return { status: 400, body: rpcError(null, -32600, "Invalid Request") };
  if (messages.length > MAX_BATCH_SIZE) {
    return { status: 400, body: rpcError(null, -32600, `Batches are limited to ${MAX_BATCH_SIZE} messages.`) };
  }

  const responses = [];
  for (const message of messages) {
    const response = await handleMessage(message, ctx, tools, server);
    if (response) responses.push(response);
  }
  if (responses.length === 0) return { status: 202 };
  return { status: 200, body: Array.isArray(payload) ? responses : responses[0] };
}
