/**
 * The 2026-11-03 snapshot (src/lib/admin/__fixtures__) shaped as board input, plus the 18 markets
 * of that day. The snapshot has no schedule days, so each listing's days come from its start and end.
 */
import { snapshotEvents, snapshotVenues, SNAPSHOT_NOW } from "@/lib/admin/__fixtures__/snapshot";
import { findDuplicateGroups } from "@/lib/venues/match";
import { placeGroupIndex } from "@/lib/events/twins";
import type { BoardEvent, BoardMarket, VerificationStatus } from "../board";

export { SNAPSHOT_NOW };

const venueById = new Map(snapshotVenues.map((v) => [v.id, v]));

export const boardEvents: BoardEvent[] = snapshotEvents.map((e) => ({
  id: e.id,
  title: e.title,
  slug: e.slug,
  status: e.status,
  startDate: new Date(e.startDate),
  endDate: new Date(e.endDate),
  scheduleDays: [],
  imageUrl: null,
  venueId: e.venue.id,
  venueName: e.venue.name,
  marketId: e.market?.id ?? null,
  deletedAt: null,
}));

const MARKETS: [string, string, VerificationStatus, string][] = [
  ["cmmadebht000l01o4ab2on6vo", "Central Valley High School Spring Craft Fair", "UNVERIFIED", "cmmadcu7u000401o4zzqk12dm"],
  ["cmw0avycy004101mmilzrpn7s", "Community Market at Silver Lake", "UNVERIFIED", "cmw0avycf003o01mmpopvs5pi"],
  ["cmmadebhm000i01o4dzyd957i", "Custer's Spring Arts & Crafts Show", "UNVERIFIED", "cmmadcu7p000201o4ame6xj2h"],
  ["cmmadebhx000n01o48uj59045", "First Friday Face-Off", "UNVERIFIED", "cmmadcu79000001o46mvju3wt"],
  ["cmmacl70l000m3pmwhwiekmut", "Kendall Yards Night Market", "VERIFIED", "cmm8tr84a000n3oqrsw33gszq"],
  ["cmw0avyco004001mmxicboc40", "Kootenai County Farmers' Market", "UNVERIFIED", "cmvv9iv10000t01mmezyemuxe"],
  ["cmmadebhf000g01o4lr9sui34", "MAC ArtFest", "UNVERIFIED", "cmmadcu7w000501o4zzspkdrh"],
  ["cmvv9iv1q001i01mmql2udwe3", "Rathdrum Craft and Farmers Market", "UNVERIFIED", "cmvv9iv1e001d01mmrn66qseh"],
  ["cmmadebhr000k01o4zmpuiqlv", "Rogers High School Spring Craft Fair", "UNVERIFIED", "cmmadcu7r000301o4xzlr4qv6"],
  ["market-south-perry-farmers", "South Perry Farmers Market", "UNVERIFIED", "cmm8tr846000m3oqrxx2qnrt5"],
  ["market-south-perry-street-fair", "South Perry Street Fair", "VERIFIED", "cmmadcu7y000601o4bkme2fse"],
  ["market-spokane-night-market", "Spokane Night Market & Street Fair", "UNVERIFIED", "cmmadcu86000901o4ams9l7e2"],
  ["market-quilt", "Spokane Quilt, Craft & Sewing Festival", "UNVERIFIED", "cmmadcu7p000201o4ame6xj2h"],
  ["market-saturday", "Spokane Saturday Market", "VERIFIED", "cmm8tr83w000k3oqr2rh58wbp"],
  ["market-valley-farmers", "Spokane Valley Farmers Market", "UNVERIFIED", "cmmadcu81000701o4mauzdecz"],
  ["market-terrain", "Terrain Bazaar", "UNVERIFIED", "cmmadcu8b000b01o4hh4lcww7"],
  ["market-university", "University High School Spring Craft Fair", "VERIFIED", "cmmadcu89000a01o4hrtxofpg"],
  ["market-valley-vintage", "Valley Craft & Vintage Fair", "UNVERIFIED", "cmm8tr84f000o3oqr8rqzg6fv"],
];

/** Snapshot market ids for the markets whose listings link to them by id. */
const LINKED_IDS: Record<string, string> = Object.fromEntries(
  snapshotEvents.filter((e) => e.market).map((e) => [e.market!.name, e.market!.id])
);

export const boardMarkets: BoardMarket[] = MARKETS.map(([id, name, verificationStatus, venueId]) => {
  const venue = venueById.get(venueId);
  if (!venue) throw new Error(`Unknown venue ${venueId} for ${name}`);
  return {
    id: LINKED_IDS[name] ?? id,
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    verificationStatus,
    deletedAt: null,
    typicalSchedule: null,
    venue: { id: venue.id, name: venue.name, address: venue.address, city: venue.city, deletedAt: venue.deletedAt },
  };
});

export const boardGroups = placeGroupIndex(findDuplicateGroups(snapshotVenues.filter((v) => !v.deletedAt)));

export function marketNamed(name: string): BoardMarket {
  const market = boardMarkets.find((m) => m.name === name);
  if (!market) throw new Error(`No market named ${name}`);
  return market;
}
