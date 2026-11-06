import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * One sentence, an optional second one in ash, an optional single action shown as a link. Say
 * which filter emptied the list: "No events in the week of Nov 21 match 'bridal'. Clear search".
 * Leave the action out when the same control is already on screen.
 */
export function Empty({
  children,
  detail,
  action,
  className,
}: {
  children: React.ReactNode;
  detail?: React.ReactNode;
  action?: { label: string; href: string };
  className?: string;
}) {
  return (
    <div className={cn("py-8", className)}>
      <p className="max-w-[72ch] text-[15px]/[23px] text-basalt">{children}</p>
      {detail && <p className="mt-1 max-w-[72ch] text-[15px]/[23px] text-ash">{detail}</p>}
      {action && (
        <p className="mt-3">
          <Link href={action.href} className="inline-flex min-h-6 items-center rounded-sm text-sm text-lilac underline-offset-4 hover:underline">
            {action.label}
          </Link>
        </p>
      )}
    </div>
  );
}
