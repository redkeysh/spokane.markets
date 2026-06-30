"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProfileImageUpload } from "@/components/profile-image-upload";
import { ACTION_PILL_CLASS } from "@/lib/constants";

interface ProfileFormProps {
  initialName: string | null;
  email: string;
  image: string | null;
  role: string;
  compact?: boolean;
  actionLinks?: Array<{ href: string; label: string }>;
}

export function ProfileForm({
  initialName,
  email,
  image,
  role,
  compact = false,
  actionLinks = [],
}: ProfileFormProps) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(initialName ?? "");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update profile");
      }
      router.refresh();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setName(initialName ?? "");
    setError(null);
    setEditing(false);
  }

  return (
    <div className="space-y-4">
      <div className={compact ? "block" : "flex items-center gap-4"}>
        {!compact ? (
          <ProfileImageUpload
            currentImage={image}
            fallbackLetter={(name || email).charAt(0).toUpperCase()}
          />
        ) : null}
        <div className={compact ? "" : "flex-1 min-w-0"}>
          {editing ? (
            <form onSubmit={handleSave} className="space-y-3">
              {compact ? null : (
                <div className="flex items-center gap-3">
                  <ProfileImageUpload
                    currentImage={image}
                    fallbackLetter={(name || email).charAt(0).toUpperCase()}
                  />
                  <p className="text-sm text-muted-foreground">Update your photo and display name.</p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="profile-name">Display name</Label>
                <Input
                  id="profile-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  maxLength={100}
                  className="font-semibold"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={saving || !name.trim()}>
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancel}
                  disabled={saving}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <>
              {compact ? null : (
                <>
                  <p className="text-lg font-bold text-foreground">
                    {name.trim() || "—"}
                  </p>
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Mail className="h-4 w-4 shrink-0" />
                    {email}
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-primary">
                    <Shield className="h-4 w-4 shrink-0" />
                    {role}
                  </p>
                </>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={ACTION_PILL_CLASS}
                  onClick={() => setEditing(true)}
                >
                  Edit profile
                </button>
                {actionLinks.map((action) => (
                  <Link key={action.href} href={action.href} className={ACTION_PILL_CLASS}>
                    {action.label}
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && (
        <p className="text-sm font-medium text-going">Profile updated</p>
      )}
    </div>
  );
}
