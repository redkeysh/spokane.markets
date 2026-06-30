import type { Metadata } from "next";
import { Suspense } from "react";
import Script from "next/script";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { ConditionalChrome } from "@/components/layout/conditional-chrome";
import { SiteBackgroundDecor } from "@/components/layout/site-background-decor";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { SiteAnnouncementBar } from "@/components/layout/site-announcement";
import { Providers } from "@/components/providers";
import { AnalyticsLoader } from "@/components/analytics/analytics-loader";
import { SITE_NAME, SITE_OG_IMAGE_PATH } from "@/lib/constants";
import { getSiteAnnouncement } from "@/lib/site-announcement";
import { getSiteTheme } from "@/lib/site-theme";
import { toJsonLdScript } from "@/lib/utils";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
  preload: false,
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  preload: false,
});

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const umamiDomain = new URL(baseUrl).hostname;
const umamiDomains =
  process.env.NEXT_PUBLIC_UMAMI_DOMAINS ??
  (baseUrl.includes("localhost")
    ? [umamiDomain, "localhost"].filter((d, i, a) => a.indexOf(d) === i).join(",")
    : [umamiDomain, `www.${umamiDomain}`].filter((d, i, a) => a.indexOf(d) === i).join(","));
const gtmId = process.env.NEXT_PUBLIC_GTM_ID;
const umamiWebsiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
/** Default script.js (Umami v2). Override via NEXT_PUBLIC_UMAMI_SCRIPT_URL if using TRACKER_SCRIPT_NAME. */
const umamiScriptUrl =
  process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL ||
  "https://analytics.spokane.markets/script.js";

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: baseUrl,
  description:
    "The best way to find markets, craft fairs, and vendor events in the Spokane area. Filter by date, neighborhood, and category.",
};

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: `${SITE_NAME} — Discover Local Markets, Fairs & Events`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "The best way to find markets, craft fairs, and vendor events in the Spokane area. Filter by date, neighborhood, and category.",
  openGraph: {
    title: SITE_NAME,
    description: "Discover local markets, fairs & events in Spokane",
    type: "website",
    images: [{ url: SITE_OG_IMAGE_PATH, width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: "Discover local markets, fairs & events in Spokane",
    images: [{ url: SITE_OG_IMAGE_PATH, alt: SITE_NAME }],
  },
};

function NavbarFallback() {
  return (
    <div className="sticky top-0 z-50 w-full border-b border-border bg-nav/95 backdrop-blur supports-[backdrop-filter]:bg-nav/95">
      <div className="mx-auto h-20 max-w-7xl px-4 sm:px-6 lg:px-8" />
    </div>
  );
}

function FooterFallback() {
  return (
    <div className="border-t border-primary/30 bg-primary" aria-hidden>
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8" />
    </div>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [theme, siteAnnouncement] = await Promise.all([
    getSiteTheme(),
    getSiteAnnouncement(),
  ]);
  const themeAttr = theme === "cedar" ? undefined : theme;

  return (
    <html lang="en" suppressHydrationWarning data-umami={umamiWebsiteId ? "enabled" : "disabled"}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: toJsonLdScript(websiteJsonLd) }}
        />
        {umamiWebsiteId && (
          <script
            defer
            src={umamiScriptUrl}
            data-website-id={umamiWebsiteId}
            data-domains={umamiDomains}
          />
        )}
      </head>
      {gtmId && (
        <>
          <Script
            id="gtm-head"
            strategy="beforeInteractive"
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer=window.dataLayer||[];window.dataLayer.push({event:'consent_default',analytics_storage:'denied',ad_storage:'denied'});(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');`,
            }}
          />
        </>
      )}
      <body
        className={`${inter.className} ${inter.variable} ${fraunces.variable}`}
        data-theme={themeAttr}
      >
        {gtmId && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
              title="Google Tag Manager"
            />
          </noscript>
        )}
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <Providers>
          <AnalyticsLoader>
            <ConditionalChrome
              nav={
                <Suspense fallback={<NavbarFallback />}>
                  <Navbar />
                </Suspense>
              }
              announcement={<SiteAnnouncementBar announcement={siteAnnouncement} />}
              footer={
                <Suspense fallback={<FooterFallback />}>
                  <Footer />
                </Suspense>
              }
            >
              <div className="relative isolate">
                <SiteBackgroundDecor />
                <div id="main" className="relative z-[1] min-h-screen">
                  {children}
                </div>
              </div>
            </ConditionalChrome>
          </AnalyticsLoader>
        </Providers>
      </body>
    </html>
  );
}
