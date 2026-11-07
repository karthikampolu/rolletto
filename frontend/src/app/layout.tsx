import "./globals.css";

import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { IBM_Plex_Mono, IBM_Plex_Sans, Inter, JetBrains_Mono, Manrope, Space_Grotesk } from "next/font/google";

import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { Providers } from "@/components/providers";
import { APPEARANCE_SCRIPT, DEFAULT_APPEARANCE } from "@/lib/appearance";
import { SITE_URL } from "@/lib/utils";

// Default faces are preloaded; the alternatives in the Appearance panel download only when selected.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], display: "swap" });
const plex = IBM_Plex_Sans({ variable: "--font-plex", subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", preload: false });
const plexMono = IBM_Plex_Mono({ variable: "--font-plexmono", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap", preload: false });
const grotesk = Space_Grotesk({ variable: "--font-grotesk", subsets: ["latin"], display: "swap", preload: false });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], display: "swap", preload: false });
const FONT_VARIABLES = [inter, mono, plex, plexMono, grotesk, manrope].map((f) => f.variable).join(" ");
const DATA_ATTRIBUTES = Object.fromEntries(Object.entries(DEFAULT_APPEARANCE).map(([k, v]) => [`data-${k}`, v]));

const DESCRIPTION =
  "Rolletto values any public company as a probability distribution: auto-built DCF and LBO models driven by 10,000 correlated Monte Carlo simulations, with comps, a football field and Excel export.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Rolletto — Monte Carlo valuation for any public company", template: "%s · Rolletto" },
  description: DESCRIPTION,
  applicationName: "Rolletto",
  keywords: ["DCF", "LBO", "Monte Carlo", "valuation", "football field", "WACC", "IRR", "equity research"],
  openGraph: { type: "website", siteName: "Rolletto", title: "Rolletto — Monte Carlo valuation", description: DESCRIPTION, url: "/" },
  twitter: { card: "summary_large_image", title: "Rolletto — Monte Carlo valuation", description: DESCRIPTION },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#070a10" },
    { media: "(prefers-color-scheme: light)", color: "#f6f7fa" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={FONT_VARIABLES} {...DATA_ATTRIBUTES}>
      <body className="flex min-h-dvh flex-col">
        {/* Applies saved appearance before first paint (no flash of the default theme). */}
        <Script id="rolletto-appearance" strategy="beforeInteractive">
          {APPEARANCE_SCRIPT}
        </Script>
        <Providers>
          <Navbar />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
