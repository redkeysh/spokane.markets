"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapPin } from "./place-map";

/**
 * Tiles are desaturated (and inverted in dark mode) so the pins carry the color. The attribution
 * rules name .leaflet-container to outrank Leaflet's own white box, which may load after this.
 */
const MAP_CSS = `
.sm-place-map .leaflet-container { font-family: inherit; background: var(--sm-fog); }
.sm-place-map .leaflet-tile-pane { filter: grayscale(0.8) contrast(0.95); }
[data-theme="admin"][data-mode="dark"] .sm-place-map .leaflet-tile-pane { filter: grayscale(1) invert(0.88) contrast(0.9); }
@media (prefers-color-scheme: dark) {
  [data-theme="admin"][data-mode="system"] .sm-place-map .leaflet-tile-pane { filter: grayscale(1) invert(0.88) contrast(0.9); }
}
.sm-place-map .leaflet-control-zoom a { background: var(--sm-sheet); color: var(--sm-basalt); border-color: var(--sm-seam); }
.sm-place-map .leaflet-container .leaflet-control-attribution { background: color-mix(in srgb, var(--sm-sheet) 80%, transparent); color: var(--sm-ash); }
.sm-place-map .leaflet-container .leaflet-control-attribution a { color: var(--sm-lilac); }
.sm-place-map .sm-pin { display: grid; place-items: center; }
.sm-place-map .sm-pin:focus-visible { outline: 2px solid var(--sm-lilac); outline-offset: 2px; border-radius: 6px; }
@media (forced-colors: active) { .sm-place-map .sm-pin path { fill: CanvasText; stroke: Canvas; } }
`;

const STEP = 0.0001;

function pinIcon(label: string | undefined): L.DivIcon {
  const text = label
    ? `<text x="14" y="17" text-anchor="middle" font-size="12" font-weight="700" fill="var(--sm-on-basalt)" font-family="inherit">${label}</text>`
    : `<circle cx="14" cy="13" r="4" fill="var(--sm-on-basalt)"/>`;
  return L.divIcon({
    className: "sm-pin",
    html: `<svg width="28" height="36" viewBox="0 0 28 36" aria-hidden="true"><path d="M14 35c-1-4-12-13-12-22a12 12 0 1 1 24 0c0 9-11 18-12 22z" fill="var(--sm-basalt)" stroke="var(--sm-sheet)" stroke-width="2"/>${text}</svg>`,
    iconSize: [28, 36],
    iconAnchor: [14, 35],
  });
}

/** The Leaflet map behind PlaceMap; loaded on the client only. */
export default function PlaceMapLeaflet({
  pins,
  onMove,
  label,
  zoom = 16,
}: {
  pins: MapPin[];
  onMove?: (lat: number, lng: number) => void;
  label: string;
  zoom?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.Marker[]>([]);
  const dragging = useRef(false);
  const viewed = useRef(false);
  const moveRef = useRef(onMove);
  const pinsRef = useRef(pins);

  useEffect(() => {
    moveRef.current = onMove;
    pinsRef.current = pins;
  });

  useEffect(() => {
    if (!el.current) return;
    const instance = L.map(el.current, { scrollWheelZoom: false, attributionControl: true, zoomControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(instance);
    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
      markers.current = [];
      dragging.current = false;
      viewed.current = false;
    };
  }, []);

  const key = pins.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)},${p.label ?? ""},${p.title}`).join(";");

  /**
   * A draggable pin that already exists is moved in place, so it keeps keyboard focus and the
   * owner's zoom. The view is set on the first pins, and again only when the pin leaves the
   * visible area (as after Find on map). Leaflet adds a marker to the page only once the map has
   * a view, so the view is set before the markers are built.
   */
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const pins = pinsRef.current;
    const draggable = !!moveRef.current && pins.length === 1;
    const titleOf = (pin: MapPin) => (draggable ? `${pin.title}. Drag the pin, or use the arrow keys to move it.` : pin.title);

    if (draggable && dragging.current && markers.current.length === 1) {
      const marker = markers.current[0];
      const at = marker.getLatLng();
      if (at.lat !== pins[0].lat || at.lng !== pins[0].lng) marker.setLatLng([pins[0].lat, pins[0].lng]);
      marker.getElement()?.setAttribute("title", titleOf(pins[0]));
      if (!instance.getBounds().contains([pins[0].lat, pins[0].lng])) instance.setView([pins[0].lat, pins[0].lng], instance.getZoom());
      return;
    }

    for (const marker of markers.current) marker.remove();
    if (pins.length === 1 && (!viewed.current || !instance.getBounds().contains([pins[0].lat, pins[0].lng]))) instance.setView([pins[0].lat, pins[0].lng], zoom);
    else if (pins.length > 1) instance.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number])), { padding: [28, 28], maxZoom: 17 });
    viewed.current = pins.length > 0;
    dragging.current = draggable;
    markers.current = pins.map((pin) => {
      const marker = L.marker([pin.lat, pin.lng], {
        icon: pinIcon(pin.label),
        draggable,
        keyboard: true,
        title: titleOf(pin),
        alt: pin.title,
      }).addTo(instance);
      if (draggable) {
        marker.on("dragend", () => {
          const at = marker.getLatLng();
          moveRef.current?.(Number(at.lat.toFixed(6)), Number(at.lng.toFixed(6)));
        });
        marker.getElement()?.addEventListener("keydown", (event) => {
          const step = event.shiftKey ? STEP * 10 : STEP;
          const delta: Record<string, [number, number]> = {
            ArrowUp: [step, 0],
            ArrowDown: [-step, 0],
            ArrowLeft: [0, -step],
            ArrowRight: [0, step],
          };
          const move = delta[event.key];
          if (!move) return;
          event.preventDefault();
          event.stopPropagation();
          const at = marker.getLatLng();
          const next = L.latLng(Number((at.lat + move[0]).toFixed(6)), Number((at.lng + move[1]).toFixed(6)));
          marker.setLatLng(next);
          moveRef.current?.(next.lat, next.lng);
        });
      }
      return marker;
    });
  }, [key, zoom]);

  return (
    <div className="sm-place-map h-full w-full">
      <style href="sm-place-map" precedence="default">
        {MAP_CSS}
      </style>
      <div ref={el} role="region" aria-label={label} className="h-full w-full" />
    </div>
  );
}
