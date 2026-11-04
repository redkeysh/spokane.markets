"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminAction } from "@/lib/admin/auth-action";
import { revalidateAdmin } from "@/lib/admin/revalidate";
import { decisionDetails } from "@/lib/admin/decision-details";
import { bringBack, dismissPair, later, laterUntil, samePlace } from "@/lib/admin/memo";
import { isUndoable, newDecisionId, undoDecision } from "@/lib/admin/undo";
import { geocodeAddress } from "@/lib/geocode";
import { assertNeighborhoodSlug } from "@/lib/neighborhoods";
import { slugify } from "@/lib/utils";
import { isPossibleDuplicate, realCoords } from "@/lib/venues/match";
import { mergeVenues, moveVenueListings, type MergeOverrides } from "@/lib/venues/merge";
import { pinProblem } from "@/lib/venues/place-check";
import { planDuplicateGroup, type PlaceRecord } from "@/lib/venues/place-review";
import { findMatchingVenue } from "@/lib/venues/resolve";
import { applyFixes, type TidyField } from "@/lib/venues/tidy";
import { loadPlaceRecords } from "@/lib/venues/place-data";
import { loadPlaceDecision, type PlaceDecisionData } from "@/lib/venues/place-decision-data";
import { plural } from "@/lib/venues/words";

export type VenueActionResult =
  | {
      ok: true;
      /** The toast and live-region sentence: "Merged 3 into Spokane Community College. Moved 3 events." */
      message: string;
      decisionId?: string;
      /** Whether Undo can reverse this decision. */
      undoable: boolean;
      /** The record to open next, e.g. a new place. */
      id?: string;
    }
  | { ok: false; error: string };

const id = z.string().min(1).max(64);
const ids = z.array(id).min(1).max(500);
const decisionKey = z.string().max(4000).optional();

function fail(error: unknown): { ok: false; error: string } {
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Something in the request is not valid." };
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

/** Whether undo.ts can reverse an audit action on a place (or another target type). */
function canUndo(action: string, targetType = "VENUE"): boolean {
  return isUndoable({ id: "", action, targetType, targetId: "check", metadata: {}, createdAt: new Date() });
}

/** Web addresses of the live pages that show these places. */
async function eventSlugsAt(venueIds: string[]): Promise<string[]> {
  if (venueIds.length === 0) return [];
  const rows = await db.event.findMany({ where: { venueId: { in: venueIds }, deletedAt: null }, select: { slug: true } });
  return rows.map((r) => r.slug);
}

type VenueChange = { id: string; title: string; previous: Record<string, unknown>; next: Record<string, unknown> };

type PlaceWriteOptions = { decisionId: string; decisionKey?: string; action?: "UPDATE_VENUE" | "SOFT_DELETE_VENUE" | "RESTORE_VENUE" };

/** Writes field changes to places, each with its audit entry, inside the caller's transaction. */
async function writePlaceChanges(tx: Prisma.TransactionClient, changes: VenueChange[], actorId: string, options: PlaceWriteOptions, at: Date) {
  const action = options.action ?? "UPDATE_VENUE";
  for (const change of changes) {
    await tx.venue.update({ where: { id: change.id }, data: change.next as Prisma.VenueUpdateInput });
    await tx.auditLog.create({
      data: {
        userId: actorId,
        action,
        targetType: "VENUE",
        targetId: change.id,
        metadata: {
          previousValue: change.previous,
          newValue: change.next,
          details: { title: change.title, at: at.toISOString(), ...decisionDetails(options) },
        } as Prisma.InputJsonValue,
      },
    });
  }
}

/** Writes field changes to places with an audit entry each (UPDATE_VENUE unless told), in one transaction. */
async function updatePlaces(changes: VenueChange[], actorId: string, options: PlaceWriteOptions) {
  const at = new Date();
  await db.$transaction((tx) => writePlaceChanges(tx, changes, actorId, options, at));
  revalidateAdmin({ eventSlugs: await eventSlugsAt(changes.map((c) => c.id)) });
}

/** "Set Cda for Emerge." or "Cleared the neighborhood of 3 places." */
function setMessage(label: string | null, changes: VenueChange[]): string {
  const what = changes.length === 1 ? changes[0].title : plural(changes.length, "place");
  return `${label ? `Set ${label} for` : "Cleared the neighborhood of"} ${what}.`;
}

const overridesSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    address: z.string().trim().min(1).max(300),
    city: z.string().trim().min(1).max(100),
    state: z.string().trim().min(2).max(50),
    zip: z.string().trim().min(5).max(10),
    neighborhood: z.string().trim().max(100).nullable(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  })
  .partial();

const mergeInput = z.object({ keepId: id, mergeIds: ids, overrides: overridesSchema.optional(), decisionKey, byHand: z.boolean().optional() });

/** Merges places into one; the kept place takes the chosen values. */
export async function mergePlaces(input: z.input<typeof mergeInput>): Promise<VenueActionResult> {
  try {
    const session = await requireAdminAction();
    const data = mergeInput.parse(input);
    const overrides: MergeOverrides = { ...data.overrides };
    if (overrides.neighborhood) overrides.neighborhood = await assertNeighborhoodSlug(overrides.neighborhood);
    const decisionId = newDecisionId();
    const result = await mergeVenues(data.keepId, data.mergeIds, session.user.id, { overrides, decisionId, decisionKey: data.decisionKey });
    if (!result.ok) return result;
    if (data.byHand) {
      for (const other of data.mergeIds) await samePlace(data.keepId, other, session.user.id, { decisionId, decisionKey: data.decisionKey });
    }
    revalidateAdmin({ eventSlugs: result.eventSlugs, marketSlugs: result.marketSlugs });
    const kept = await db.venue.findUnique({ where: { id: result.keepId }, select: { name: true } });
    const moved = [result.eventsMoved ? plural(result.eventsMoved, "event") : null, result.marketsMoved ? plural(result.marketsMoved, "market") : null]
      .filter(Boolean)
      .join(" and ");
    return {
      ok: true,
      decisionId,
      undoable: true,
      id: result.keepId,
      message: `Merged ${data.mergeIds.length + 1} into ${kept?.name ?? "one place"}.${moved ? ` Moved ${moved}.` : " Nothing had to move."}`,
    };
  } catch (error) {
    return fail(error);
  }
}

const safeInput = z.object({ groups: z.array(z.object({ ids: z.array(id).min(2).max(20) })).min(1).max(100) });

/**
 * Merges groups whose extra records hold nothing and share one street address. Each group is
 * checked again here; one that is no longer safe is left for the owner.
 */
export async function mergeSafeGroups(input: z.input<typeof safeInput>): Promise<VenueActionResult> {
  try {
    const session = await requireAdminAction();
    const data = safeInput.parse(input);
    const records = new Map((await loadPlaceRecords()).map((r) => [r.id, r]));
    const decisionId = newDecisionId();
    let merged = 0;
    let archived = 0;
    const skipped: string[] = [];
    for (const group of data.groups) {
      const rows = group.ids.map((g) => records.get(g)).filter((r): r is PlaceRecord => !!r && !r.deletedAt);
      const plan = rows.length === group.ids.length ? planDuplicateGroup(rows) : null;
      if (!plan?.safe) {
        skipped.push(rows[0]?.name ?? "a group");
        continue;
      }
      const result = await mergeVenues(plan.keepId, plan.records.slice(1).map((r) => r.id), session.user.id, {
        decisionId,
        decisionKey: plan.key,
      });
      if (result.ok) {
        merged += 1;
        archived += plan.records.length - 1;
      } else skipped.push(plan.records[0].name);
    }
    revalidateAdmin();
    if (merged === 0) return { ok: false, error: `Nothing was merged: ${skipped.join(", ")} changed and needs a look.` };
    return {
      ok: true,
      decisionId,
      undoable: true,
      message: `Merged ${plural(merged, "group")} and archived ${plural(archived, "empty record")}.${skipped.length ? ` Left for you: ${skipped.join(", ")}.` : ""}`,
    };
  } catch (error) {
    return fail(error);
  }
}

const pairInput = z.object({ ids: z.array(id).min(2).max(20), decisionKey, title: z.string().max(300).optional() });

/** Remembers that the places are different, so they are never offered as duplicates again. */
export async function markDifferentPlaces(input: z.input<typeof pairInput>): Promise<VenueActionResult> {
  try {
    const session = await requireAdminAction();
    const data = pairInput.parse(input);
    const decisionId = newDecisionId();
    for (let i = 0; i < data.ids.length; i++) {
      for (let j = i + 1; j < data.ids.length; j++) {
        await dismissPair("not-same-place", data.ids[i], data.ids[j], session.user.id, { decisionId, decisionKey: data.decisionKey, title: data.title });
      }
    }
    revalidateAdmin();
    return { ok: true, decisionId, undoable: true, message: `Kept ${plural(data.ids.length, "place")} apart. They will not be offered as duplicates again.` };
  } catch (error) {
    return fail(error);
  }
}

const neighborhoodInput = z.object({ venueIds: ids, slug: z.string().trim().max(100).nullable(), decisionKey });

/** Sets one neighborhood (or none) on places. */
export async function setPlacesNeighborhood(input: z.input<typeof neighborhoodInput>): Promise<VenueActionResult> {
  try {
    const session = await requireAdminAction();
    const data = neighborhoodInput.parse(input);
    const slug = data.slug ? await assertNeighborhoodSlug(data.slug) : null;
    const rows = await db.venue.findMany({ where: { id: { in: data.venueIds } }, select: { id: true, name: true, neighborhood: true } });
    const changes = rows
      .filter((r) => r.neighborhood !== slug)
      .map((r) => ({ id: r.id, title: r.name, previous: { neighborhood: r.neighborhood }, next: { neighborhood: slug } }));
    if (changes.length === 0) return { ok: true, undoable: false, message: "Nothing changed: those places already had it." };
    const decisionId = newDecisionId();
    await updatePlaces(changes, session.user.id, { decisionId, decisionKey: data.decisionKey });
    const label = slug ? ((await db.neighborhood.findUnique({ where: { slug }, select: { label: true } }))?.label ?? slug) : null;
    return { ok: true, decisionId, undoable: canUndo("UPDATE_VENUE"), message: setMessage(label, changes) };
  } catch (error) {
    return fail(error);
  }
}

const acceptInput = z.object({ groups: z.array(z.object({ venueIds: ids, slug: z.string().trim().min(1).max(100) })).min(1).max(200), decisionKey });

/** Accepts several neighborhood suggestions as one decision. */
export async function acceptNeighborhoodSuggestions(input: z.input<typeof acceptInput>): Promise<VenueActionResult> {
  try {
    const session = await requireAdminAction();
    const data = acceptInput.parse(input);
    const slugs = new Map<string, string>();
    for (const group of data.groups) {
      const slug = await assertNeighborhoodSlug(group.slug);
      if (!slug) return { ok: false, error: "Pick a neighborhood." };
      for (const venueId of group.venueIds) slugs.set(venueId, slug);
    }
    const rows = await db.venue.findMany({ where: { id: { in: [...slugs.keys()] } }, select: { id: true, name: true, neighborhood: true } });
    const changes = rows
      .filter((r) => r.neighborhood !== slugs.get(r.id))
      .map((r) => ({ id: r.id, title: r.name, previous: { neighborhood: r.neighborhood }, next: { neighborhood: slugs.get(r.id)! } }));
    if (changes.length === 0) return { ok: true, undoable: false, message: "Nothing changed: those places already had them." };
    const decisionId = newDecisionId();
    await updatePlaces(changes, session.user.id, { decisionId, decisionKey: data.decisionKey });
    return { ok: true, decisionId, undoable: canUndo("UPDATE_VENUE"), message: `Set neighborhoods for ${plural(changes.length, "place")}.` };
  } catch (error) {
    return fail(error);
  }
}

const addNeighborhoodInput = z.object({
  label: z.string().trim().min(1, "Name the neighborhood.").max(80),
  venueIds: ids,
  decisionKey,
});

/**
 * Adds a neighborhood (or turns an existing one with that web name back on) and sets it on the
 * places, as one decision in one transaction. The neighborhood appears in the public area filter
 * and in subscriber area choices; undoing the decision turns it off again.
 */
export async function addNeighborhoodAndSet(input: z.input<typeof addNeighborhoodInput>): Promise<VenueActionResult> {
  try {
    const session = await requireAdminAction();
    const data = addNeighborhoodInput.parse(input);
    const slug = slugify(data.label.replace(/['’]/g, ""));
    if (!slug) return { ok: false, error: "Give the neighborhood a name with letters or numbers." };
    const existing = await db.neighborhood.findUnique({ where: { slug } });
    const label = existing?.label ?? data.label;
    const turnsOn = !existing?.isActive;
    const rows = await db.venue.findMany({ where: { id: { in: data.venueIds } }, select: { id: true, name: true, neighborhood: true } });
    const changes = rows
      .filter((r) => r.neighborhood !== slug)
      .map((r) => ({ id: r.id, title: r.name, previous: { neighborhood: r.neighborhood }, next: { neighborhood: slug } }));
    if (!turnsOn && changes.length === 0) return { ok: true, undoable: false, message: `Nothing changed: those places already had ${label}.` };

    const decisionId = newDecisionId();
    const ref = { decisionId, decisionKey: data.decisionKey };
    const at = new Date();
    const neighborhoodAction = existing ? "UPDATE_NEIGHBORHOOD" : "CREATE_NEIGHBORHOOD";
    await db.$transaction(async (tx) => {
      if (turnsOn) {
        const neighborhood = existing
          ? await tx.neighborhood.update({ where: { slug }, data: { isActive: true } })
          : await tx.neighborhood.create({ data: { slug, label, isActive: true } });
        await tx.auditLog.create({
          data: {
            userId: session.user.id,
            action: neighborhoodAction,
            targetType: "NEIGHBORHOOD",
            targetId: neighborhood.id,
            metadata: {
              previousValue: existing ? { isActive: existing.isActive } : null,
              newValue: { slug, label: neighborhood.label, isActive: true },
              details: { title: neighborhood.label, at: at.toISOString(), ...decisionDetails(ref) },
            } as Prisma.InputJsonValue,
          },
        });
      }
      await writePlaceChanges(tx, changes, session.user.id, ref, at);
    });
    revalidateAdmin({ eventSlugs: await eventSlugsAt(changes.map((c) => c.id)) });

    const placesUndoable = changes.length === 0 || canUndo("UPDATE_VENUE");
    const neighborhoodUndoable = !turnsOn || canUndo(neighborhoodAction, "NEIGHBORHOOD");
    const parts = [
      turnsOn ? `${existing ? "Turned on" : "Added"} ${label}.` : null,
      changes.length ? setMessage(label, changes) : null,
      turnsOn && placesUndoable && !neighborhoodUndoable ? `${label} stays in the area filter until you turn it off in the Neighborhood list.` : null,
    ];
    return {
      ok: true,
      decisionId,
      undoable: placesUndoable && neighborhoodUndoable,
      message: parts.filter(Boolean).join(" "),
    };
  } catch (error) {
    return fail(error);
  }
}

const fields = z.enum(["name", "address", "city", "state", "zip"]);
const spellingInput = z.object({ items: z.array(z.object({ venueId: id, fields: z.array(fields).min(1) })).min(1).max(500), decisionKey });

/** Applies the safe spelling fixes, computed again here from the current values. */
export async function fixPlaceSpelling(input: z.input<typeof spellingInput>): Promise<VenueActionResult> {
  try {
    const session = await requireAdminAction();
    const data = spellingInput.parse(input);
    const wanted = new Map(data.items.map((i) => [i.venueId, i.fields as TidyField[]]));
    const rows = await db.venue.findMany({
      where: { id: { in: [...wanted.keys()] }, deletedAt: null },
      select: { id: true, name: true, address: true, city: true, state: true, zip: true },
    });
    const changes: VenueChange[] = [];
    for (const row of rows) {
      const next = applyFixes(row, wanted.get(row.id) ?? []);
      const keys = Object.keys(next) as TidyField[];
      if (keys.length === 0) continue;
      changes.push({ id: row.id, title: next.name ?? row.name, previous: Object.fromEntries(keys.map((k) => [k, row[k]])), next });
    }
    if (changes.length === 0) return { ok: true, undoable: false, message: "Nothing to fix: those places are already tidy." };
    const planned = new Set<string>();
    for (const change of changes) {
      const row = rows.find((r) => r.id === change.id)!;
      const name = (change.next.name as string | undefined) ?? row.name;
      const address = (change.next.address as string | undefined) ?? row.address;
      const clash = `${row.name} would then share its name and address with another place. Merge them first.`;
      const key = JSON.stringify([name, address]);
      if (planned.has(key)) return { ok: false, error: clash };
      planned.add(key);
      const taken = await db.venue.findFirst({ where: { name, address, id: { not: row.id } }, select: { name: true } });
      if (taken) return { ok: false, error: clash };
    }
    const decisionId = newDecisionId();
    await updatePlaces(changes, session.user.id, { decisionId, decisionKey: data.decisionKey });
    return { ok: true, decisionId, undoable: canUndo("UPDATE_VENUE"), message: `Fixed the spelling of ${plural(changes.length, "place")}.` };
  } catch (error) {
    return fail(error);
  }
}

const archiveInput = z.object({ venueIds: ids, decisionKey });

/** Archives places nothing uses. A place something uses is left alone and named. */
export async function archiveUnusedPlaces(input: z.input<typeof archiveInput>): Promise<VenueActionResult> {
  try {
    const session = await requireAdminAction();
    const data = archiveInput.parse(input);
    const rows = await db.venue.findMany({
      where: { id: { in: data.venueIds }, deletedAt: null },
      select: {
        id: true,
        name: true,
        _count: { select: { events: { where: { deletedAt: null } }, markets: { where: { deletedAt: null } } } },
      },
    });
    const unused = rows.filter((r) => r._count.events === 0 && r._count.markets === 0);
    const used = rows.filter((r) => !unused.includes(r));
    if (unused.length === 0) {
      return { ok: false, error: used.length ? `Not archived: ${used.map((r) => r.name).join(", ")} ${used.length === 1 ? "is" : "are"} in use.` : "Those places are already archived." };
    }
    const decisionId = newDecisionId();
    const at = new Date().toISOString();
    await updatePlaces(
      unused.map((r) => ({ id: r.id, title: r.name, previous: { deletedAt: null }, next: { deletedAt: at } })),
      session.user.id,
      { decisionId, decisionKey: data.decisionKey, action: "SOFT_DELETE_VENUE" }
    );
    return {
      ok: true,
      decisionId,
      undoable: canUndo("SOFT_DELETE_VENUE"),
      message: `Archived ${unused.length === 1 ? unused[0].name : plural(unused.length, "place")}.${used.length ? ` Left ${used.map((r) => r.name).join(", ")}: in use.` : ""}`,
    };
  } catch (error) {
    return fail(error);
  }
}

/** Restores archived places. */
export async function restorePlaces(input: z.input<typeof archiveInput>): Promise<VenueActionResult> {
  try {
    const session = await requireAdminAction();
    const data = archiveInput.parse(input);
    const rows = await db.venue.findMany({ where: { id: { in: data.venueIds }, deletedAt: { not: null } }, select: { id: true, name: true, address: true, deletedAt: true } });
    if (rows.length === 0) return { ok: false, error: "Those places are not archived." };
    for (const row of rows) {
      const twin = await db.venue.findFirst({ where: { name: row.name, address: row.address, deletedAt: null, id: { not: row.id } }, select: { id: true } });
      if (twin) return { ok: false, error: `${row.name} is already listed at ${row.address}. Move its listings there instead.` };
    }
    const decisionId = newDecisionId();
    await updatePlaces(
      rows.map((r) => ({ id: r.id, title: r.name, previous: { deletedAt: r.deletedAt!.toISOString() }, next: { deletedAt: null } })),
      session.user.id,
      { decisionId, decisionKey: data.decisionKey, action: "RESTORE_VENUE" }
    );
    return { ok: true, decisionId, undoable: canUndo("RESTORE_VENUE"), message: `Restored ${rows.length === 1 ? rows[0].name : plural(rows.length, "place")}.` };
  } catch (error) {
    return fail(error);
  }
}

const moveInput = z.object({ fromId: id, toId: id, decisionKey });

/** Moves every event and market of a place to another one, e.g. from an archived place still in use. */
export async function movePlaceListings(input: z.input<typeof moveInput>): Promise<VenueActionResult> {
  try {
    const session = await requireAdminAction();
    const data = moveInput.parse(input);
    const decisionId = newDecisionId();
    const result = await moveVenueListings(data.fromId, data.toId, session.user.id, { decisionId, decisionKey: data.decisionKey });
    if (!result.ok) return result;
    revalidateAdmin({ eventSlugs: result.eventSlugs, marketSlugs: result.marketSlugs });
    const to = await db.venue.findUnique({ where: { id: data.toId }, select: { name: true } });
    const moved = [result.eventsMoved ? plural(result.eventsMoved, "event") : null, result.marketsMoved ? plural(result.marketsMoved, "market") : null]
      .filter(Boolean)
      .join(" and ");
    return { ok: true, decisionId, undoable: true, message: `Moved ${moved} to ${to?.name ?? "the other place"}.` };
  } catch (error) {
    return fail(error);
  }
}

const placeInput = z.object({
  id: id.optional(),
  name: z.string().trim().min(1, "Name the place.").max(200),
  address: z.string().trim().min(1, "Add the street address.").max(300),
  city: z.string().trim().min(1, "Add the town.").max(100),
  state: z.string().trim().min(2, "Add the state.").max(50),
  zip: z
    .string()
    .trim()
    .regex(/^\d{5}(-\d{4})?$/, "ZIP must be five digits, like 99201."),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  neighborhood: z.string().trim().max(100).nullable(),
  parkingNotes: z.string().trim().max(1000, "Parking notes must be 1000 characters or fewer.").nullable(),
  /** Create even though a similar place exists. */
  createAnyway: z.boolean().optional(),
});

export type PlaceInput = z.input<typeof placeInput>;

export type SavePlaceResult =
  | { ok: true; id: string; message: string; decisionId?: string; undoable: boolean }
  | { ok: false; error: string; field?: string }
  | { ok: false; error: string; match: { id: string; name: string; address: string; city: string; archived: boolean; exact: boolean } };

/** Creates or saves a place. A new place is checked against existing ones first. */
export async function savePlace(input: PlaceInput): Promise<SavePlaceResult> {
  try {
    const session = await requireAdminAction();
    const parsed = placeInput.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return { ok: false, error: issue?.message ?? "Check the fields.", field: issue?.path[0]?.toString() };
    }
    const data = parsed.data;
    const neighborhood = data.neighborhood ? await assertNeighborhoodSlug(data.neighborhood) : null;
    let coords = data.lat != null && data.lng != null ? realCoords({ lat: data.lat, lng: data.lng }) : null;

    if (!data.id) {
      const exact = await findMatchingVenue({ ...data, lat: coords?.lat ?? null, lng: coords?.lng ?? null });
      if (exact) {
        return {
          ok: false,
          error: exact.deletedAt ? `${exact.name} already exists but is archived.` : `${exact.name} already exists at ${exact.address}.`,
          match: { id: exact.id, name: exact.name, address: exact.address, city: exact.city, archived: !!exact.deletedAt, exact: true },
        };
      }
      if (!data.createAnyway) {
        const nearby = await db.venue.findMany({
          where: { deletedAt: null, OR: [{ zip: { startsWith: data.zip.slice(0, 3) } }, { city: { equals: data.city, mode: "insensitive" } }] },
          select: { id: true, name: true, address: true, city: true, zip: true, lat: true, lng: true },
        });
        const similar = nearby.find((v) => isPossibleDuplicate({ ...data, lat: coords?.lat, lng: coords?.lng }, v));
        if (similar) {
          return {
            ok: false,
            error: `${similar.name} at ${similar.address} looks like the same place.`,
            match: { id: similar.id, name: similar.name, address: similar.address, city: similar.city, archived: false, exact: false },
          };
        }
      }
      if (!coords) {
        coords = await geocodeAddress(data);
        if (!coords) return { ok: false, error: "Couldn't find this address on the map. Drag the pin to the place, then save.", field: "address" };
      }
      const pin = pinProblem(coords);
      if (pin) return { ok: false, error: pin.message, field: "pin" };
      const created = await db.venue.create({
        data: { name: data.name, address: data.address, city: data.city, state: data.state, zip: data.zip, lat: coords.lat, lng: coords.lng, neighborhood, parkingNotes: data.parkingNotes || null },
      });
      await db.auditLog.create({
        data: {
          userId: session.user.id,
          action: "CREATE_VENUE",
          targetType: "VENUE",
          targetId: created.id,
          metadata: { newValue: { name: created.name, address: created.address }, details: { title: created.name, at: new Date().toISOString() } } as Prisma.InputJsonValue,
        },
      });
      revalidateAdmin();
      return { ok: true, id: created.id, undoable: false, message: `Added ${created.name}.` };
    }

    const current = await db.venue.findUnique({ where: { id: data.id } });
    if (!current) return { ok: false, error: "This place no longer exists." };
    if (!coords) coords = realCoords(current);
    if (coords) {
      const pin = pinProblem(coords);
      if (pin) return { ok: false, error: pin.message, field: "pin" };
    }
    const wanted: Record<string, unknown> = {
      name: data.name,
      address: data.address,
      city: data.city,
      state: data.state,
      zip: data.zip,
      neighborhood,
      parkingNotes: data.parkingNotes || null,
      ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
    };
    const next = Object.fromEntries(Object.entries(wanted).filter(([key, value]) => value !== current[key as keyof typeof current]));
    if (Object.keys(next).length === 0) return { ok: true, id: current.id, undoable: false, message: "Nothing to save: no changes." };
    if (next.name !== undefined || next.address !== undefined) {
      const taken = await db.venue.findFirst({ where: { name: data.name, address: data.address, id: { not: current.id } }, select: { id: true, name: true } });
      if (taken) return { ok: false, error: `Another place, ${taken.name}, already has this name and address. Merge them instead.`, field: "name" };
    }
    const previous = Object.fromEntries(Object.keys(next).map((key) => [key, current[key as keyof typeof current] ?? null]));
    const decisionId = newDecisionId();
    await updatePlaces([{ id: current.id, title: data.name, previous, next }], session.user.id, { decisionId });
    return { ok: true, id: current.id, decisionId, undoable: canUndo("UPDATE_VENUE"), message: `Saved ${data.name}.` };
  } catch (error) {
    return fail(error);
  }
}

const geocodeInput = z.object({ address: z.string().trim().max(300), city: z.string().trim().max(100), state: z.string().trim().max(50), zip: z.string().trim().max(10) });

/** Looks the address up on the map; nothing is saved. */
export async function findPlaceOnMap(input: z.input<typeof geocodeInput>): Promise<{ ok: true; lat: number; lng: number } | { ok: false; error: string }> {
  try {
    await requireAdminAction();
    const data = geocodeInput.parse(input);
    if (!data.address) return { ok: false, error: "Add the street address first." };
    const found = await geocodeAddress(data);
    if (!found) return { ok: false, error: "Couldn't find this address on the map. Check the street, town and ZIP, or drag the pin." };
    const pin = pinProblem(found);
    if (pin) return { ok: false, error: `Found it, but ${pin.message.charAt(0).toLowerCase()}${pin.message.slice(1)}` };
    return { ok: true, ...found };
  } catch (error) {
    return fail(error);
  }
}

export type PlaceSearchRow = { id: string; name: string; address: string; city: string; zip: string; archived: boolean; events: number; markets: number };

const searchInput = z.object({ q: z.string().trim().max(100), excludeIds: z.array(id).max(50).optional(), includeArchived: z.boolean().optional() });

/** Places whose name, address or town contains the words, for pickers. */
export async function searchPlaces(input: z.input<typeof searchInput>): Promise<PlaceSearchRow[]> {
  await requireAdminAction();
  const data = searchInput.parse(input);
  if (data.q.length < 2) return [];
  const rows = await db.venue.findMany({
    where: {
      ...(data.includeArchived ? {} : { deletedAt: null }),
      ...(data.excludeIds?.length ? { id: { notIn: data.excludeIds } } : {}),
      OR: [
        { name: { contains: data.q, mode: "insensitive" } },
        { address: { contains: data.q, mode: "insensitive" } },
        { city: { contains: data.q, mode: "insensitive" } },
      ],
    },
    orderBy: { name: "asc" },
    take: 8,
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      zip: true,
      deletedAt: true,
      _count: { select: { events: { where: { deletedAt: null } }, markets: { where: { deletedAt: null } } } },
    },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, address: r.address, city: r.city, zip: r.zip, archived: !!r.deletedAt, events: r._count.events, markets: r._count.markets }));
}

/** The records for a merge picked by hand ("Find a missed duplicate"). */
export async function loadPlacesForMerge(input: { ids: string[] }): Promise<PlaceRecord[]> {
  await requireAdminAction();
  const wanted = new Set(z.array(id).min(2).max(10).parse(input.ids));
  return (await loadPlaceRecords()).filter((r) => wanted.has(r.id) && !r.deletedAt);
}

/** Returns a place decision put off until later to the pile now. */
export async function bringBackPlaceDecision(input: { key: string; title: string }): Promise<VenueActionResult> {
  try {
    const session = await requireAdminAction();
    const key = z.string().min(1).max(4000).parse(input.key);
    const decisionId = newDecisionId();
    const back = await bringBack(key, session.user.id, { decisionId, decisionKey: key, title: input.title });
    return back ? { ok: true, decisionId, undoable: true, message: `Brought back ${input.title}.` } : { ok: false, error: "It was not put off." };
  } catch (error) {
    return fail(error);
  }
}

/** Undoes a venue decision: merges, moves, and (when undo supports them) field changes, archives and restores. */
export async function undoPlaceDecision(decisionId: string): Promise<{ ok: boolean; message: string }> {
  const session = await requireAdminAction();
  const result = await undoDecision(z.string().min(1).max(100).parse(decisionId), session.user.id);
  revalidateAdmin();
  return { ok: result.ok, message: result.message };
}

const laterInput = z.object({ key: z.string().min(1).max(4000), title: z.string().max(300), until: z.enum(["tomorrow", "next-monday"]) });

/** Puts a place decision off until tomorrow or next Monday. */
export async function putPlaceOffLater(input: z.input<typeof laterInput>): Promise<VenueActionResult> {
  try {
    const session = await requireAdminAction();
    const data = laterInput.parse(input);
    const decisionId = newDecisionId();
    const until = laterUntil(data.until);
    await later(data.key, until, session.user.id, { decisionId, decisionKey: data.key, title: data.title });
    return { ok: true, decisionId, undoable: true, message: `Put off ${data.title} until ${data.until === "tomorrow" ? "tomorrow" : "next Monday"}.` };
  } catch (error) {
    return fail(error);
  }
}

/** The data a place decision's pane on To do shows, by decision key. */
export async function getPlaceDecisionData(key: string): Promise<PlaceDecisionData | null> {
  await requireAdminAction();
  return loadPlaceDecision(z.string().min(1).max(4000).parse(key));
}
