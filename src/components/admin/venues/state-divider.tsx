/** The state line between the Washington and Idaho towns of All places, as one list item. */
export function StateDivider() {
  return (
    <li className="bg-fog px-4 py-3">
      <div role="separator" aria-label="State line. Idaho places follow." className="flex items-center gap-3">
        <span aria-hidden="true" className="h-px flex-1 bg-seam-strong" />
        <span aria-hidden="true" className="font-display text-xs/[14px] font-bold text-ash">
          WA
        </span>
        <span aria-hidden="true" className="h-4 w-0.5 bg-seam-strong" />
        <span aria-hidden="true" className="font-display text-xs/[14px] font-bold text-ash">
          ID
        </span>
        <span aria-hidden="true" className="h-px flex-1 bg-seam-strong" />
      </div>
    </li>
  );
}
