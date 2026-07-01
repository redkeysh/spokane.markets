"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";
import { getApiErrorMessage } from "@/lib/api-client";

interface UserDeleteButtonProps {
  userId: string;
  userName: string | null;
  userEmail: string;
  isCurrentUser: boolean;
}

export function UserDeleteButton({
  userId,
  userName,
  userEmail,
  isCurrentUser,
}: UserDeleteButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = userName || userEmail;

  async function handleDelete() {
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        const body = await res.json();
        setError(getApiErrorMessage(body, "Failed to delete user"));
      }
    } finally {
      setDeleting(false);
    }
  }

  if (isCurrentUser) {
    return null;
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Delete ${displayName}`}
        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete user</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {displayName}? This will remove their
              account and all associated data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p className="px-6 text-sm text-destructive">{error}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
