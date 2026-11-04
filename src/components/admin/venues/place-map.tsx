"use client";

import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";

export type MapPin = { lat: number; lng: number; title: string; label?: string };

const Leaflet = dynamic(() => import("./place-map-leaflet"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-fog" />,
});

/**
 * A map of one place with a pin that can be dragged (or moved with the arrow keys) when `onMove`
 * is given, or of several numbered pins, read only, for duplicate records whose addresses differ.
 */
export function PlaceMap({
  pins,
  onMove,
  label,
  className,
  zoom,
}: {
  pins: MapPin[];
  onMove?: (lat: number, lng: number) => void;
  /** Accessible name of the map region, e.g. "Map of Kendall Yards". */
  label: string;
  className?: string;
  zoom?: number;
}) {
  return (
    <div className={cn("relative isolate overflow-hidden rounded-md border border-seam-strong bg-fog", className)}>
      <Leaflet pins={pins} onMove={onMove} label={label} zoom={zoom} />
    </div>
  );
}
