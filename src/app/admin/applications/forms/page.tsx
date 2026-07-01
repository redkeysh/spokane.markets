import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { FormsEditorClient } from "./forms-editor-client";

export const dynamic = "force-dynamic";

export default async function AdminApplicationFormsPage() {
  await requireAdmin();

  const forms = await db.applicationForm.findMany({
    orderBy: { type: "asc" },
  });

  const serialized = forms.map((f) => ({
    id: f.id,
    type: f.type,
    title: f.title,
    description: f.description,
    fields: f.fields as FormField[],
    active: f.active,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Application Form Fields"
        description="Configure form fields for Vendor, Market, and Vendor Verification applications."
      />
      <FormsEditorClient initialForms={serialized} />
    </div>
  );
}

export type FormField = {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "email" | "checkbox";
  required?: boolean;
  options?: string[];
  placeholder?: string;
  helpText?: string;
};
