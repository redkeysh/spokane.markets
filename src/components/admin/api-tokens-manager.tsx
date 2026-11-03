"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bot, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { EmptyState } from "@/components/admin/empty-state";
import { AdminTable, AdminTableBody, AdminTableHead } from "@/components/admin/admin-table";
import { createApiTokenAction, revokeApiTokenAction } from "@/app/admin/actions";
import { cn } from "@/lib/utils";

export type ApiTokenRow = {
  id: string;
  name: string;
  prefix: string;
  access: "READ" | "WRITE";
  owner: string;
  created: string;
  lastUsed: string | null;
  expires: string | null;
  status: "active" | "expired" | "revoked";
};

const EXPIRY_OPTIONS = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
  { value: "never", label: "Never" },
] as const;

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy. Select the text and copy it manually.");
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs">
          {value}
        </code>
        <Button type="button" variant="outline" size="sm" onClick={copy} aria-label={`Copy ${label}`}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function NewTokenPanel({ token, mcpUrl, onDone }: { token: string; mcpUrl: string; onDone: () => void }) {
  const command = `claude mcp add --transport http spokane-markets ${mcpUrl} --header "Authorization: Bearer ${token}"`;
  return (
    <section className="space-y-4 rounded-xl border border-emerald-600/40 bg-emerald-600/5 p-4">
      <div>
        <h2 className="font-semibold">Copy your token now</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This is the only time the token is shown. Only a hash is stored, so a lost token has to be revoked and replaced.
        </p>
      </div>
      <CopyField label="Token" value={token} />
      <CopyField label="Claude Code" value={command} />
      <p className="text-sm text-muted-foreground">
        Other MCP clients connect to <code className="rounded bg-muted px-1">{mcpUrl}</code> over Streamable HTTP with the
        header <code className="rounded bg-muted px-1">Authorization: Bearer &lt;token&gt;</code>.
      </p>
      <Button type="button" size="sm" onClick={onDone}>
        I saved it
      </Button>
    </section>
  );
}

function CreateTokenForm({ onCreated }: { onCreated: (token: string) => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [access, setAccess] = useState<"READ" | "WRITE">("READ");
  const [expiry, setExpiry] = useState<(typeof EXPIRY_OPTIONS)[number]["value"]>("90");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const result = await createApiTokenAction({
          name,
          access,
          expiresInDays: expiry === "never" ? null : (Number(expiry) as 30 | 90 | 365),
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setName("");
        onCreated(result.token);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not create the token.");
      }
    });
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-4 rounded-xl border border-border bg-card p-4 md:grid-cols-[minmax(0,1fr)_200px_160px_auto] md:items-end"
    >
      <div className="space-y-1.5">
        <Label htmlFor="token-name">Name</Label>
        <Input
          id="token-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Claude on my laptop"
          maxLength={80}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="token-access">Access</Label>
        <Select id="token-access" value={access} onChange={(e) => setAccess(e.target.value as "READ" | "WRITE")}>
          <option value="READ">Read only</option>
          <option value="WRITE">Read and write</option>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="token-expiry">Expires</Label>
        <Select
          id="token-expiry"
          value={expiry}
          onChange={(e) => setExpiry(e.target.value as (typeof EXPIRY_OPTIONS)[number]["value"])}
        >
          {EXPIRY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" disabled={pending || name.trim() === ""}>
        Create token
      </Button>
      <p className="text-xs text-muted-foreground md:col-span-4">
        Read only tokens can search and inspect. Read and write tokens can also approve or reject submissions, edit events and
        venues, and merge duplicate venues. Every change is recorded in the audit log under your name.
      </p>
    </form>
  );
}

const STATUS_BADGE = {
  active: { label: "Active", variant: "success" },
  expired: { label: "Expired", variant: "secondary" },
  revoked: { label: "Revoked", variant: "secondary" },
} as const;

export function ApiTokensManager({ tokens, mcpUrl }: { tokens: ApiTokenRow[]; mcpUrl: string }) {
  const router = useRouter();
  const [newToken, setNewToken] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ApiTokenRow | null>(null);
  const [pending, startTransition] = useTransition();

  function revoke() {
    if (!revoking) return;
    startTransition(async () => {
      try {
        const result = await revokeApiTokenAction(revoking.id);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(`Revoked ${revoking.name}.`);
        setRevoking(null);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not revoke the token.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {newToken ? (
        <NewTokenPanel token={newToken} mcpUrl={mcpUrl} onDone={() => setNewToken(null)} />
      ) : (
        <CreateTokenForm onCreated={setNewToken} />
      )}

      {tokens.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="No API tokens yet"
          description="Create a token above, then add the MCP server to Claude with the command shown."
        />
      ) : (
        <AdminTable>
          <AdminTableHead>
            <th className="p-3">Name</th>
            <th className="p-3">Token</th>
            <th className="p-3">Access</th>
            <th className="p-3">Owner</th>
            <th className="p-3">Created</th>
            <th className="p-3">Last used</th>
            <th className="p-3">Expires</th>
            <th className="p-3">Status</th>
            <th className="p-3" />
          </AdminTableHead>
          <AdminTableBody>
            {tokens.map((t) => {
              const status = STATUS_BADGE[t.status];
              return (
                <tr key={t.id} className={cn(t.status !== "active" && "text-muted-foreground")}>
                  <td className="p-3 font-medium">{t.name}</td>
                  <td className="p-3 font-mono text-xs">{t.prefix}…</td>
                  <td className="p-3">{t.access === "WRITE" ? "Read and write" : "Read only"}</td>
                  <td className="p-3">{t.owner}</td>
                  <td className="p-3 whitespace-nowrap">{t.created}</td>
                  <td className="p-3 whitespace-nowrap">{t.lastUsed ?? "Never"}</td>
                  <td className="p-3 whitespace-nowrap">{t.expires ?? "Never"}</td>
                  <td className="p-3">
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </td>
                  <td className="p-3 text-right">
                    {t.status === "active" && (
                      <Button type="button" variant="outline" size="sm" onClick={() => setRevoking(t)}>
                        Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminTable>
      )}

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={`Revoke ${revoking?.name ?? "token"}?`}
        description="Any client using this token loses access immediately. This cannot be undone."
        confirmLabel="Revoke token"
        variant="destructive"
        pending={pending}
        onConfirm={revoke}
      />
    </div>
  );
}
