import { NextResponse } from "next/server";
import { authenticateApiToken } from "@/lib/api-tokens";
import { checkRateLimit } from "@/lib/rate-limit";
import { handleMcpPayload, rpcError } from "@/lib/mcp/protocol";
import { ADMIN_MCP_SERVER, ADMIN_TOOLS } from "@/lib/mcp/admin-tools";

export const dynamic = "force-dynamic";

/** MCP Streamable HTTP endpoint (stateless, JSON responses). Authenticated by API token. */
export async function POST(request: Request) {
  const auth = await authenticateApiToken(request.headers.get("authorization"));
  if (!auth.ok) {
    return NextResponse.json(rpcError(null, -32001, auth.message), {
      status: auth.status,
      headers: auth.status === 401 ? { "WWW-Authenticate": 'Bearer realm="spokane-markets-admin"' } : undefined,
    });
  }

  const limit = await checkRateLimit(auth.principal.tokenId, "mcp");
  if (!limit.ok) {
    return NextResponse.json(rpcError(null, -32000, "Rate limit exceeded. Slow down and retry."), {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfter ?? 60) },
    });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(rpcError(null, -32700, "Parse error"), { status: 400 });
  }

  const { status, body } = await handleMcpPayload(payload, auth.principal, ADMIN_TOOLS, ADMIN_MCP_SERVER);
  return body === undefined ? new Response(null, { status }) : NextResponse.json(body, { status });
}

/** No server-initiated stream is offered. */
export function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}

export function DELETE() {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}
