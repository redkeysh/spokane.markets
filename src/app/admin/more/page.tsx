import type { Metadata } from "next";
import { GroupHeading, List, ListRow } from "@/components/admin/kit/list";
import { PageHeader } from "@/components/admin/kit/page-header";
import { Preferences } from "@/components/admin/more/preferences";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "More" };

type DirectoryItem = { label: string; href: string; sentence: string };
type DirectoryGroup = {
  id: string;
  heading: string;
  items: DirectoryItem[];
  phoneOnly?: boolean;
};

const DIRECTORY: DirectoryGroup[] = [
  {
    id: "listings",
    heading: "Vendors and the site",
    phoneOnly: true,
    items: [
      {
        label: "Vendors",
        href: "/admin/vendors",
        sentence: "Vendor profiles, who claimed them and where they sell.",
      },
      {
        label: "Site",
        href: "/admin/site",
        sentence:
          "What the public homepage shows: the announcement bar, featured events, banners, colors and maintenance.",
      },
    ],
  },
  {
    id: "people",
    heading: "People",
    items: [
      {
        label: "Users",
        href: "/admin/users",
        sentence: "Accounts and roles: who can sign in and what they can do.",
      },
      {
        label: "Subscribers",
        href: "/admin/subscribers",
        sentence: "People who get the newsletter and the area emails.",
      },
    ],
  },
  {
    id: "lists",
    heading: "Lists",
    items: [
      {
        label: "Tags and features",
        href: "/admin/tags",
        sentence: "The tags and features you can put on an event.",
      },
      {
        label: "Neighborhoods",
        href: "/admin/venues?view=neighborhood-list",
        sentence: "The areas places belong to, used by the area filter.",
      },
      {
        label: "Community badges",
        href: "/admin/badges",
        sentence: "Badges vendors and markets can show on their profiles.",
      },
      {
        label: "Application forms",
        href: "/admin/applications/forms",
        sentence: "The questions vendors answer when they apply.",
      },
    ],
  },
  {
    id: "public",
    heading: "From the public",
    items: [
      {
        label: "Sent from the site",
        href: "/admin/submissions",
        sentence: "Events people sent in, waiting or decided.",
      },
      {
        label: "Reviews",
        href: "/admin/reviews",
        sentence: "What people wrote about events and markets.",
      },
      {
        label: "Photos",
        href: "/admin/photos",
        sentence: "Pictures people added to events and markets.",
      },
      {
        label: "Reports",
        href: "/admin/reports",
        sentence: "Problems people flagged on a listing.",
      },
      {
        label: "Applications",
        href: "/admin/applications",
        sentence: "Answers sent through the application forms.",
      },
    ],
  },
  {
    id: "tools",
    heading: "Tools",
    items: [
      {
        label: "Import and export",
        href: "/admin/data",
        sentence: "Bring in events from a file, or download what is listed.",
      },
      {
        label: "API tokens",
        href: "/admin/api-tokens",
        sentence:
          "Keys that let an assistant such as Claude work on the listings for you.",
      },
      {
        label: "History",
        href: "/admin/audit-log",
        sentence:
          "Everything changed in the admin, by you or an API token, with Undo where possible.",
      },
    ],
  },
  {
    id: "graphics",
    heading: "Graphics",
    items: [
      {
        label: "Graphics studio",
        href: "/admin/marketing/asset-studio",
        sentence: "Make a picture for social posts from an event or market.",
      },
      {
        label: "Past graphics",
        href: "/admin/marketing/asset-studio/history",
        sentence: "Every graphic made so far, ready to download again.",
      },
      {
        label: "Templates",
        href: "/admin/marketing/asset-studio/templates",
        sentence: "The layouts the graphics studio starts from.",
      },
    ],
  },
];

export default function AdminMorePage() {
  return (
    <div className="mx-auto max-w-[1184px] space-y-6 pb-8">
      <PageHeader
        title="More"
        description="Screens you need now and then, each with what it is for."
      />

      <div className="gap-x-10 lg:columns-2">
        {DIRECTORY.map((group) => (
          <section
            key={group.id}
            aria-labelledby={`more-${group.id}`}
            className={cn("mb-6 break-inside-avoid", group.phoneOnly && "md:hidden")}
          >
            <GroupHeading as="h2" sticky={false} className="px-0">
              <span id={`more-${group.id}`}>{group.heading}</span>
            </GroupHeading>
            <List label={group.heading}>
              {group.items.map((item) => (
                <ListRow
                  key={item.href}
                  rowKey={item.href}
                  href={item.href}
                  title={item.label}
                  meta={item.sentence}
                  className="min-h-14"
                />
              ))}
            </List>
          </section>
        ))}

        <section
          aria-labelledby="more-preferences"
          id="preferences"
          className="mb-6 scroll-mt-4 break-inside-avoid"
        >
          <GroupHeading as="h2" sticky={false} className="px-0">
            <span id="more-preferences">Preferences</span>
          </GroupHeading>
          <Preferences />
        </section>
      </div>
    </div>
  );
}
