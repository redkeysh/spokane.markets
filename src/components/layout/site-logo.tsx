import Image from "next/image";
import Link from "next/link";
import { SITE_NAME } from "@/lib/constants";

export function SiteLogo() {
  return (
    <Link
      href="/"
      prefetch={false}
      className="group flex items-center gap-3 transition-opacity hover:opacity-90"
    >
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
        <Image
          src="/market.png"
          alt=""
          width={40}
          height={40}
          className="object-contain"
          priority
        />
      </div>
      <div className="flex flex-col leading-tight">
        <span className="font-heading text-xl font-bold tracking-tight text-foreground">
          <span className="text-primary">{SITE_NAME.split(" ")[0]}</span>
          {SITE_NAME.includes(" ") && (
            <>
              {" "}
              <span className="text-foreground/90">
                {SITE_NAME.split(" ").slice(1).join(" ")}
              </span>
            </>
          )}
        </span>
      </div>
    </Link>
  );
}
