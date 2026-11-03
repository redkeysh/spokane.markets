import type { LucideIcon } from "lucide-react";
import { Empty } from "@/components/admin/kit/empty";

/**
 * The kit Empty behind the original props. `icon` is accepted and not drawn: empty states are
 * sentences, with no illustration or icon tile.
 */
export function EmptyState(props: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Empty detail={props.description} action={props.action} className={props.className}>
      {props.title}
    </Empty>
  );
}
