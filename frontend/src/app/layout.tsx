import "./globals.css";

import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { Providers } from "@/components/providers";
import { SITE_URL } from "@/lib/utils";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], display: "swap" });

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
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${mono.variable}`}>
      <body className="flex min-h-dvh flex-col">
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
