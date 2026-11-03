import { PageHeader } from "@/components/admin/kit/page-header";

export type Breadcrumb = { label: string; href?: string };

/**
 * The kit PageHeader behind the original props. Breadcrumbs become one back link to the
 * nearest linked crumb ("Back to Events"); there are no slash trails.
 */
export function AdminPageHeader({
  title,
  description,
  breadcrumbs = [],
  actions,
}: {
  title: string;
  description?: string;
  breadcrumbs?: Breadcrumb[];
  actions?: React.ReactNode;
}) {
  const parent = [...breadcrumbs].reverse().find((b) => b.href);
  return (
    <PageHeader
      title={title}
      description={description}
      actions={actions}
      back={parent?.href ? { href: parent.href, label: `Back to ${parent.label}` } : undefined}
    />
  );
}
