"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate, cn } from "@/lib/utils";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

type ApplicationStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "NEEDS_INFO"
  | "DUPLICATE";

type FormField = {
  id: string;
  label: string;
  type?: string;
  required?: boolean;
};

type SerializedApplication = {
  id: string;
  formId: string;
  userId: string | null;
  status: ApplicationStatus;
  answers: Record<string, unknown>;
  name: string;
  email: string;
  notes: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
  updatedAt: string;
  potentialDuplicateCount: number;
  form: {
    type: string;
    title: string;
    fields: FormField[];
  };
  user: {
    id: string;
    name: string | null;
    email: string;
    role: string;
  } | null;
};

const STATUS_TABS: { label: string; value: "all" | ApplicationStatus }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "PENDING" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Needs info", value: "NEEDS_INFO" },
  { label: "Duplicate", value: "DUPLICATE" },
];

const statusBadgeVariant: Record<
  ApplicationStatus,
  "outline" | "default" | "destructive" | "secondary"
> = {
  PENDING: "outline",
  APPROVED: "default",
  REJECTED: "destructive",
  NEEDS_INFO: "secondary",
  DUPLICATE: "secondary",
};

function getStatusCounts(applications: SerializedApplication[]) {
  const counts = {
    all: applications.length,
    PENDING: 0,
    APPROVED: 0,
    REJECTED: 0,
    NEEDS_INFO: 0,
    DUPLICATE: 0,
  };
  for (const app of applications) {
    counts[app.status]++;
  }
  return counts;
}

function filterApplications(
  applications: SerializedApplication[],
  filter: "all" | ApplicationStatus
) {
  if (filter === "all") return applications;
  return applications.filter((a) => a.status === filter);
}

type Props = {
  applications: SerializedApplication[];
};

export function ApplicationsClient({ applications }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<"all" | ApplicationStatus>("all");
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    applicationId: string;
    action: "APPROVED" | "REJECTED" | "NEEDS_INFO" | "DUPLICATE";
    applicantName: string;
  } | null>(null);
  const [notes, setNotes] = useState("");

  const counts = getStatusCounts(applications);
  const filtered = filterApplications(applications, filter);

  const openConfirm = (
    id: string,
    action: "APPROVED" | "REJECTED" | "NEEDS_INFO" | "DUPLICATE",
    applicantName: string
  ) => {
    setConfirmDialog({ open: true, applicationId: id, action, applicantName });
    setNotes("");
  };

  const closeConfirm = () => {
    setConfirmDialog(null);
    setNotes("");
  };

  const submitDecision = () => {
    if (!confirmDialog) return;
    const { applicationId, action } = confirmDialog;
    startTransition(async () => {
      const res = await fetch(`/api/admin/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: action,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("Failed to update application:", err);
        return;
      }
      closeConfirm();
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Applications"
        description={`${counts.all} total · ${counts.PENDING} pending · ${counts.APPROVED} approved · ${counts.REJECTED} rejected · ${counts.NEEDS_INFO} needs info · ${counts.DUPLICATE} duplicate`}
      />

      <div className="flex gap-2 border-b border-border pb-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setFilter(tab.value)}
            className={cn(
              "px-3 py-1.5 text-sm rounded-md transition-colors",
              filter === tab.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {filtered.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center">
            No {filter === "all" ? "" : filter.toLowerCase() + " "}applications.
          </p>
        ) : (
          filtered.map((app) => (
            <ApplicationCard
              key={app.id}
              application={app}
              onApprove={() => openConfirm(app.id, "APPROVED", app.name)}
              onReject={() => openConfirm(app.id, "REJECTED", app.name)}
              onNeedsInfo={() => openConfirm(app.id, "NEEDS_INFO", app.name)}
              onDuplicate={() => openConfirm(app.id, "DUPLICATE", app.name)}
            />
          ))
        )}
      </div>

      <Dialog
        open={!!confirmDialog}
        onOpenChange={(open) => !open && closeConfirm()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update application status</DialogTitle>
            <DialogDescription>
              Set a new status for {confirmDialog?.applicantName}&apos;s application and add optional notes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label
              htmlFor="admin-notes"
              className="text-sm font-medium text-foreground"
            >
              Admin notes (optional)
            </label>
            <Textarea
              id="admin-notes"
              placeholder="Add notes for your records..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeConfirm} disabled={isPending}>
              Cancel
            </Button>
            <Button
              variant={confirmDialog?.action === "REJECTED" ? "destructive" : "default"}
              onClick={submitDecision}
              disabled={isPending}
            >
              {isPending
                ? "Processing..."
                : "Save status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ApplicationCard({
  application,
  onApprove,
  onReject,
  onNeedsInfo,
  onDuplicate,
}: {
  application: SerializedApplication;
  onApprove: () => void;
  onReject: () => void;
  onNeedsInfo: () => void;
  onDuplicate: () => void;
}) {
  const fields = (application.form.fields ?? []) as FormField[];
  const answers = application.answers ?? {};
  const fieldMap = new Map(fields.map((f) => [f.id, f]));

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{application.name}</CardTitle>
            <CardDescription>{application.email}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{application.form.type}</Badge>
            <Badge variant={statusBadgeVariant[application.status]}>
              {application.status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {formatDate(new Date(application.createdAt))}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-2 text-sm">
          {Object.entries(answers).map(([fieldId, value]) => {
            const field = fieldMap.get(fieldId);
            const label = field?.label ?? fieldId;
            const display =
              Array.isArray(value) ? value.join(", ") : String(value ?? "");
            if (!display) return null;
            return (
              <div key={fieldId} className="flex gap-2">
                <dt className="font-medium text-muted-foreground min-w-[120px]">
                  {label}:
                </dt>
                <dd className="text-foreground">{display}</dd>
              </div>
            );
          })}
        </dl>

        {application.user && (
          <p className="text-sm text-muted-foreground">
            Linked account: {application.user.name ?? application.user.email}{" "}
            ({application.user.role})
          </p>
        )}

        {application.potentialDuplicateCount > 1 && (
          <p className="text-sm text-amber-700">
            Potential duplicate: {application.potentialDuplicateCount} applications found with this email.
          </p>
        )}

        {application.notes && (
          <div className="rounded-md bg-muted/50 p-3 text-sm">
            <p className="font-medium text-muted-foreground">Admin notes</p>
            <p className="mt-1 text-foreground">{application.notes}</p>
          </div>
        )}

        {application.status === "PENDING" && (
          <div className="flex gap-2 pt-2">
            <Button size="sm" onClick={onApprove}>
              Approve
            </Button>
            <Button size="sm" variant="destructive" onClick={onReject}>
              Reject
            </Button>
            <Button size="sm" variant="outline" onClick={onNeedsInfo}>
              Needs info
            </Button>
            <Button size="sm" variant="outline" onClick={onDuplicate}>
              Mark duplicate
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
