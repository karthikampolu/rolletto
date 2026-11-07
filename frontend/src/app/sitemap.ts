import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/utils";

const SAMPLES = ["AAPL", "MSFT", "KO", "RELIANCE.NS", "TCS.NS"];

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/analyze`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/methodology`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/about`, changeFrequency: "yearly", priority: 0.5 },
    ...SAMPLES.map((t) => ({ url: `${SITE_URL}/analyze/${t}`, changeFrequency: "daily" as const, priority: 0.6 })),
  ];
}
