import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getMaintenanceState } from "@/lib/maintenance";
import { isPrivilegedForMaintenance } from "@/lib/maintenance";
import { isValidCallbackUrl } from "@/lib/utils";
import { MaintenanceMarkdown } from "@/components/maintenance-markdown";
import { MaintenanceTracker } from "@/components/maintenance-tracker";

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function MaintenancePage({ searchParams }: PageProps) {
  const session = await auth.api.getSession({ headers: await headers() });
  const state = await getMaintenanceState();

  if (isPrivilegedForMaintenance(session?.user?.role as import("@prisma/client").Role | undefined, state.mode)) {
    const params = await searchParams;
    const nextVal = params.next;
    const nextStr = Array.isArray(nextVal) ? nextVal[0] : nextVal;
    const dest = isValidCallbackUrl(nextStr) && nextStr ? nextStr : "/";
    redirect(dest);
  }

  const etaStr = state.eta
    ? new Date(state.eta).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/Los_Angeles",
        timeZoneName: "short",
      })
    : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl">
        {state.messageTitle}
      </h1>
      <div className="mt-6 max-w-xl text-left">
        <MaintenanceMarkdown
          content={state.messageBody}
          className="text-lg text-muted-foreground"
        />
      </div>
      {etaStr && (
        <p className="mt-4 text-sm text-muted-foreground">
          Estimated return: {etaStr}
        </p>
      )}
      <MaintenanceTracker links={state.links} />
    </div>
  );
}
