import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-utils";
import { loadNeighborhoods } from "@/lib/venues/place-data";
import { PlacePage, type PlacePageData } from "@/components/admin/venues/place-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New place" };

export default async function NewPlaceRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const params = await searchParams;
  const text = (key: string) => (typeof params[key] === "string" ? (params[key] as string).slice(0, 300) : "");
  const neighborhoods = await loadNeighborhoods();
  const data: PlacePageData = {
    id: null,
    form: {
      name: text("name"),
      address: text("address"),
      city: text("city") || "Spokane",
      state: text("state") || "WA",
      zip: text("zip"),
      lat: null,
      lng: null,
      neighborhood: "",
      parkingNotes: "",
    },
    archived: false,
    updatedAt: null,
    uses: { events: 0, markets: 0 },
    upcoming: [],
    past: [],
    markets: [],
    lookAlikes: [],
    history: [],
  };
  return <PlacePage data={data} neighborhoods={neighborhoods} now={new Date().toISOString()} />;
}
