"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { createApiTokenAction, revokeApiTokenAction } from "@/app/admin/actions";
import { AdminButton } from "@/components/admin/kit/button";
import { Empty } from "@/components/admin/kit/empty";
import { Field, Section } from "@/components/admin/kit/field";
import { List } from "@/components/admin/kit/list";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { StaticRow } from "@/components/admin/rare/action-row";
import { SelectInput, TextInput } from "@/components/admin/rare/controls";
import { useAnnounce } from "@/components/admin/shell/live-region";
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
  { value: "30", label: "In 30 days" },
  { value: "90", label: "In 90 days" },
  { value: "365", label: "In a year" },
  { value: "never", label: "Never" },
] as const;

const STATUS = {
  active: { label: "Active", className: "text-basalt" },
  expired: { label: "Expired", className: "text-ash-quiet" },
  revoked: { label: "Revoked", className: "text-ash-quiet" },
} as const;

function CopyField({ id, label, value }: { id: string; label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy. Select the text and copy it yourself.");
    }
  }

  return (
    <div>
      <label htmlFor={id} className="block font-text text-sm font-medium text-basalt">
        {label}
      </label>
      <div className="mt-1.5 flex items-start gap-2">
        <textarea
          id={id}
          readOnly
          rows={value.length > 80 ? 3 : 1}
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="min-h-9 w-full resize-none rounded-md border border-seam-strong bg-sheet px-3 py-2 font-text text-sm leading-5 break-all text-basalt"
        />
        <AdminButton variant="outline" onClick={copy} aria-label={`Copy the ${label.toLowerCase()}`}>
          {copied ? <Check strokeWidth={1.75} aria-hidden="true" /> : <Copy strokeWidth={1.75} aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </AdminButton>
      </div>
    </div>
  );
}

function NewTokenPanel({ token, mcpUrl, onDone }: { token: string; mcpUrl: string; onDone: () => void }) {
  const command = `claude mcp add --transport http spokane-markets ${mcpUrl} --header "Authorization: Bearer ${token}"`;
  return (
    <Section id="new-token" title="Copy your token now">
      <p className="max-w-[72ch] font-text text-sm text-ash">
        This is the only time it is shown. Only a fingerprint of it is kept, so a lost token has to be revoked and
        replaced.
      </p>
      <CopyField id="new-token-value" label="Token" value={token} />
      <CopyField id="new-token-command" label="Command for Claude Code" value={command} />
      <p className="max-w-[72ch] font-text text-sm text-ash">
        Other assistants connect to {mcpUrl} over Streamable HTTP with the header Authorization: Bearer and the token.
      </p>
      <div>
        <AdminButton variant="ink" onClick={onDone}>
          I saved it
        </AdminButton>
      </div>
    </Section>
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
        toast.error(err instanceof Error ? err.message : "Could not make the token.");
      }
    });
  }

  return (
    <Section id="new-token" title="New token">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem_10rem] md:items-start">
          <Field id="token-name" label="Name" help="Say where it is used.">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Claude on my laptop" maxLength={80} />
          </Field>
          <Field id="token-access" label="Access">
            <SelectInput value={access} onChange={(e) => setAccess(e.target.value as "READ" | "WRITE")}>
              <option value="READ">Read only</option>
              <option value="WRITE">Read and write</option>
            </SelectInput>
          </Field>
          <Field id="token-expiry" label="Stops working">
            <SelectInput value={expiry} onChange={(e) => setExpiry(e.target.value as (typeof EXPIRY_OPTIONS)[number]["value"])}>
              {EXPIRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
        <p className="max-w-[72ch] font-text text-xs text-ash">
          Read only tokens can search and look. Read and write tokens can also publish or reject what the public sends,
          edit events and places, and merge duplicate places. History records every change under your name.
        </p>
        <AdminButton type="submit" variant="ink" disabled={name.trim() === ""} busy={pending} busyLabel="Making the token">
          Make token
        </AdminButton>
      </form>
    </Section>
  );
}

function tokenMeta(t: ApiTokenRow): string {
  return [
    t.access === "WRITE" ? "Read and write" : "Read only",
    `starts with ${t.prefix}`,
    `made by ${t.owner} on ${t.created}`,
    t.lastUsed ? `last used ${t.lastUsed}` : "never used",
    t.status === "revoked" ? null : t.expires ? `${t.status === "expired" ? "stopped" : "stops"} working on ${t.expires}` : "never stops working",
  ]
    .filter(Boolean)
    .join(", ");
}

/** Make a token, copy it once, and see or revoke the ones that exist. */
export function ApiTokensManager({ tokens, mcpUrl }: { tokens: ApiTokenRow[]; mcpUrl: string }) {
  const router = useRouter();
  const announce = useAnnounce();
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
        const message = `Revoked ${revoking.name}.`;
        toast.success(message);
        announce(message);
        setRevoking(null);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not revoke the token.");
      }
    });
  }

  return (
    <div className="space-y-10">
      {newToken ? (
        <NewTokenPanel token={newToken} mcpUrl={mcpUrl} onDone={() => setNewToken(null)} />
      ) : (
        <CreateTokenForm
          onCreated={(token) => {
            setNewToken(token);
            announce("Token made. Copy it now: it is shown only once.");
          }}
        />
      )}

      <Section id="tokens" title="Tokens">
        {tokens.length === 0 ? (
          <Empty className="py-2" detail="Make one above, then add the server to Claude with the command shown.">
            There are no API tokens yet.
          </Empty>
        ) : (
          <List label="Tokens">
            {tokens.map((t) => (
              <StaticRow
                key={t.id}
                title={t.name}
                muted={t.status !== "active"}
                meta={<span className="tabular-nums">{tokenMeta(t)}</span>}
                status={<span className={cn("font-text text-sm font-medium", STATUS[t.status].className)}>{STATUS[t.status].label}</span>}
                action={
                  t.status === "active" ? (
                    <AdminButton variant="danger-outline" size="sm" onClick={() => setRevoking(t)} aria-haspopup="dialog">
                      Revoke<span className="sr-only"> {t.name}</span>
                    </AdminButton>
                  ) : undefined
                }
              />
            ))}
          </List>
        )}
      </Section>

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={`Revoke ${revoking?.name ?? "this token"}?`}
        description="Anything using it loses access at once. This cannot be undone."
        confirmLabel="Revoke token"
        variant="destructive"
        pending={pending}
        onConfirm={revoke}
      />
    </div>
  );
}
