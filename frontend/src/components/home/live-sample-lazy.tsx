"use client";

import dynamic from "next/dynamic";
import * as React from "react";

import { Skeleton } from "@/components/ui/skeleton";

const LiveSample = dynamic(() => import("@/components/home/live-sample").then((m) => m.LiveSample), {
  ssr: false,
  loading: () => <Skeleton className="h-[420px] w-full rounded-lg" />,
});

/** Loads the charting bundle and runs the sample valuation only once the section scrolls into view. */
export function LazyLiveSample() {
  const ref = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) setVisible(true);
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref}>{visible ? <LiveSample /> : <Skeleton className="h-[420px] w-full rounded-lg" />}</div>;
}
