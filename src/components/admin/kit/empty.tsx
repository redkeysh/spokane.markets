import { cn } from "@/lib/utils";

/**
 * One sentence, an optional second one in ash, an optional single action. Say which filter
 * emptied the list: "No events in the week of Nov 21 match 'bridal'."
 */
export function Empty({
  children,
  detail,
  action,
  className,
}: {
  children: React.ReactNode;
  detail?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("py-8", className)}>
      <p className="max-w-[72ch] text-[15px]/[23px] text-basalt">{children}</p>
      {detail && <p className="mt-1 max-w-[72ch] text-[15px]/[23px] text-ash">{detail}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
