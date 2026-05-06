import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Facebook, Instagram } from "lucide-react";
import { Outfit } from "next/font/google";
import { FounderPhoto } from "@/components/founder-photo";
import { SITE_NAME } from "@/lib/constants";
import { buildFacebookUrl, buildInstagramUrl, cn } from "@/lib/utils";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: `Meet the founder — ${SITE_NAME}`,
  description:
    "Meet Hunter, the founder of Spokane Markets — Navy veteran, engineer, and Spokane local building community discovery for markets, events, and small businesses.",
};

const cream = "#fcf8f1";
const ink = "#3d3529";
const cedar = "#204d3a";
const umber = "#734a25";
const honey = "#d4a964";

const SOCIAL_HANDLE = "spokane.markets";

export default function BackstoryPage() {
  const instagramUrl = buildInstagramUrl(SOCIAL_HANDLE);
  const facebookUrl = buildFacebookUrl(SOCIAL_HANDLE);

  return (
    <div
      className={cn(
        outfit.className,
        "relative min-w-0 pb-16 pt-6 sm:pb-20 sm:pt-8"
      )}
      style={{
        backgroundColor: cream,
        color: ink,
        colorScheme: "light",
      }}
    >
      {/* Top / bottom brand strips (framing the page like the flyer) */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[7px]"
        style={{
          background: `linear-gradient(90deg, ${cedar}, ${umber}, ${cedar})`,
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[7px]"
        style={{
          background: `linear-gradient(90deg, ${umber}, ${cedar}, ${umber})`,
        }}
        aria-hidden
      />

      {/* Atmospheric gradients (flyer) */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden
      >
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse at 15% 85%, rgba(115,74,37,0.07) 0%, transparent 50%),
              radial-gradient(ellipse at 85% 15%, rgba(32,77,58,0.06) 0%, transparent 50%)`,
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <Link
          href="/about"
          className="mb-10 inline-flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-80"
          style={{ color: cedar }}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to About
        </Link>

        <header className="text-center">
          <p
            className="mb-2 text-[14px] font-semibold uppercase tracking-[4.5px]"
            style={{ color: cedar }}
          >
            Meet the founder
          </p>
          <h1
            className="font-heading text-[clamp(2rem,6vw,3.125rem)] font-black leading-[1.05] tracking-tight"
            style={{ color: cedar }}
          >
            {SITE_NAME}
          </h1>
          <p
            className="mt-2 font-heading text-[clamp(1.25rem,3.5vw,1.9375rem)] font-bold"
            style={{ color: umber }}
          >
            Built for local discovery
          </p>
        </header>

        {/* Icon divider */}
        <div className="my-10 flex items-center justify-center gap-4 sm:gap-[18px]">
          <span
            className="hidden h-[1.5px] w-[100px] sm:block sm:w-[140px]"
            style={{ backgroundColor: `${ink}bf` }}
          />
          <Image
            src="/market.png"
            alt=""
            width={68}
            height={68}
            className="h-14 w-14 shrink-0 object-contain sm:h-[68px] sm:w-[68px]"
          />
          <span
            className="hidden h-[1.5px] w-[100px] sm:block sm:w-[140px]"
            style={{ backgroundColor: `${ink}bf` }}
          />
        </div>

        {/* Meet section */}
        <div className="flex flex-col items-center gap-10 md:flex-row md:items-center md:gap-11">
          <div
            className="shrink-0 rounded-full p-1.5 shadow-[0_14px_42px_rgba(32,77,58,0.18),0_8px_18px_rgba(115,74,37,0.14)]"
            style={{
              background: `linear-gradient(135deg, ${cedar} 0%, ${umber} 100%)`,
            }}
          >
            <FounderPhoto shape="circle" className="h-[220px] w-[220px] sm:h-[280px] sm:w-[280px]" />
          </div>

          <div className="min-w-0 flex-1 text-center md:text-left">
            <h2
              className="font-heading text-[clamp(2rem,5vw,3.625rem)] font-black leading-[1.04] tracking-tight"
              style={{ color: cedar }}
            >
              Hey Spokane,
              <br />
              I&apos;m Hunter.
            </h2>
            <p className="mt-4 text-[clamp(1.0625rem,2.5vw,1.4375rem)] font-light leading-[1.55]">
              I&apos;m a former Navy servicemember, former cybersecurity engineer, and current
              Avista employee. I started {SITE_NAME} to make it easier for our
              community to find markets, events, and the small businesses behind them.
            </p>
          </div>
        </div>

        {/* Mission band */}
        <div
          className="mx-auto mt-12 max-w-3xl rounded-[22px] px-6 py-6 text-center sm:px-8 sm:py-7"
          style={{ backgroundColor: cedar }}
        >
          <p className="font-heading text-[clamp(1.25rem,3vw,1.75rem)] font-normal leading-[1.45] text-[#fcf8f1]">
            What started with my mom&apos;s vendor experience grew into a bigger goal:{" "}
            <span className="font-bold" style={{ color: honey }}>
              build something genuinely useful for Spokane.
            </span>
          </p>
        </div>

        {/* Contact row */}
        <div className="mx-auto mt-10 max-w-3xl">
          <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2.5 text-[17px] leading-snug sm:text-[18px]">
            <a
              href="https://spokane.markets"
              className="flex max-w-full items-center gap-2.5 break-all font-bold transition-opacity hover:opacity-80"
              style={{ color: cedar }}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: cedar }}
                aria-hidden
              />
              https://spokane.markets
            </a>
            <a
              href="mailto:hello@spokane.markets"
              className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
              style={{ color: ink }}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: cedar }}
                aria-hidden
              />
              hello@spokane.markets
            </a>
            <a
              href="tel:+15092135088"
              className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
              style={{ color: ink }}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: cedar }}
                aria-hidden
              />
              509-213-5088
            </a>
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-3.5">
              <span className="font-bold" style={{ color: cedar }}>
                @{SOCIAL_HANDLE}
              </span>
              <div className="flex items-center gap-3" style={{ color: cedar }}>
                <a
                  href={instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-opacity hover:opacity-70"
                  aria-label="Instagram"
                >
                  <Instagram className="h-7 w-7" strokeWidth={1.75} />
                </a>
                <a
                  href={facebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-opacity hover:opacity-70"
                  aria-label="Facebook"
                >
                  <Facebook className="h-7 w-7" strokeWidth={1.75} />
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/about"
            className="inline-flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-80"
            style={{ color: cedar }}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to About & Contact
          </Link>
        </div>
      </div>
    </div>
  );
}
