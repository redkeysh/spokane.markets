import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/kit/page-header";
import { FormsEditorClient } from "./forms-editor-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Application forms" };

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
    <div className="mx-auto w-full max-w-[1184px] space-y-8">
      <PageHeader
        className="max-w-[784px]"
        title="Application forms"
        description="The questions people answer when they apply as a vendor, ask to list a market, or ask to be a verified vendor."
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
