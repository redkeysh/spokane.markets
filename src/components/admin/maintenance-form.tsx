"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import { cn, formatForDateTimeLocal } from "@/lib/utils";
import type { MaintenanceMode } from "@prisma/client";

interface MaintenanceLink {
  label: string;
  url: string;
}

interface MaintenanceFormProps {
  initialState: {
    mode: MaintenanceMode;
    messageTitle: string;
    messageBody: string | null;
    links: MaintenanceLink[];
    eta: Date | null;
  };
}

const MODE_LABELS: Record<MaintenanceMode, string> = {
  OFF: "Off (normal site)",
  MAINTENANCE_ADMIN_ONLY: "Maintenance — Admins only",
  MAINTENANCE_PRIVILEGED: "Maintenance — Admins + Vendors + Organizers",
};

export function MaintenanceForm({ initialState }: MaintenanceFormProps) {
  const router = useRouter();
  const [mode, setMode] = React.useState<MaintenanceMode>(initialState.mode);
  const [messageTitle, setMessageTitle] = React.useState(
    initialState.messageTitle
  );
  const [messageBody, setMessageBody] = React.useState(
    initialState.messageBody ?? ""
  );
  const [links, setLinks] = React.useState<MaintenanceLink[]>(
    initialState.links?.length ? [...initialState.links] : []
  );
  const [eta, setEta] = React.useState(
    initialState.eta ? formatForDateTimeLocal(new Date(initialState.eta)) : ""
  );
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      const payload = {
        mode,
        messageTitle,
        messageBody: messageBody.trim() || null,
        links: links.filter((l) => l.label.trim() && l.url.trim()),
        eta: eta || null,
      };
      const res = await fetch("/api/admin/site-config/maintenance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        let errMsg = `Save failed (${res.status})`;
        try {
          const data = JSON.parse(text);
          if (typeof data?.error === "string") errMsg = data.error;
          else if (data?.error?.message) errMsg = data.error.message;
        } catch {
          if (text) errMsg = text.slice(0, 200);
        }
        throw new Error(errMsg);
      }
      router.refresh();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-xl space-y-6 rounded-lg border border-border bg-card p-6"
    >
      <div className="space-y-2">
        <Label htmlFor="maintenance-mode">Mode</Label>
        <select
          id="maintenance-mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as MaintenanceMode)}
          className={cn(
            "flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          {(Object.keys(MODE_LABELS) as MaintenanceMode[]).map((m) => (
            <option key={m} value={m}>
              {MODE_LABELS[m]}
            </option>
          ))}
        </select>
        <p className="text-sm text-muted-foreground">
          {mode === "OFF" && "Site is fully accessible."}
          {mode === "MAINTENANCE_ADMIN_ONLY" &&
            "Only admins can access. Everyone else sees the maintenance page."}
          {mode === "MAINTENANCE_PRIVILEGED" &&
            "Admins, vendors, and organizers can access. Others see the maintenance page."}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="maintenance-title">Message title</Label>
        <Input
          id="maintenance-title"
          value={messageTitle}
          onChange={(e) => setMessageTitle(e.target.value)}
          placeholder="We'll be right back"
          className="font-semibold"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="maintenance-body">Message body</Label>
        <Textarea
          id="maintenance-body"
          value={messageBody}
          onChange={(e) => setMessageBody(e.target.value)}
          placeholder="We're working on something great. Check back soon! Use Markdown: links [text](url), lists, blockquotes (>) for notes."
          rows={5}
          className="resize-y"
        />
        <p className="text-xs text-muted-foreground">
          Markdown supported: links, lists, bold. Use <code className="rounded bg-muted px-1">&gt; **Note:**</code> for info callouts.
        </p>
      </div>

      <div className="space-y-2">
        <Label>CTA links (optional)</Label>
        <p className="text-xs text-muted-foreground">
          Prominent buttons/links shown below the message.
        </p>
        <div className="space-y-2">
          {links.map((link, i) => (
            <div key={i} className="flex gap-2">
              <Input
                placeholder="Label"
                value={link.label}
                onChange={(e) => {
                  const next = [...links];
                  next[i] = { ...next[i], label: e.target.value };
                  setLinks(next);
                }}
              />
              <Input
                placeholder="URL"
                value={link.url}
                onChange={(e) => {
                  const next = [...links];
                  next[i] = { ...next[i], url: e.target.value };
                  setLinks(next);
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setLinks(links.filter((_, j) => j !== i))}
                aria-label="Remove link"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLinks([...links, { label: "", url: "" }])}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add link
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="maintenance-eta">Estimated return (optional)</Label>
        <Input
          id="maintenance-eta"
          type="datetime-local"
          value={eta}
          onChange={(e) => setEta(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && (
        <p className="text-sm font-medium text-primary">Saved</p>
      )}

      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
