"use client";

import * as React from "react";

import { money, price, tableNumber, tableScale } from "@/lib/format";

export interface Fmt {
  ccy: string;
  indian: boolean;
  money: (v: number | null | undefined) => string;
  price: (v: number | null | undefined) => string;
  scaleLabel: string;
  table: (v: number | null | undefined, decimals?: number) => string;
}

export function makeFmt(ccy: string, indian: boolean): Fmt {
  const scale = tableScale(ccy, indian);
  return {
    ccy,
    indian,
    money: (v) => money(v, ccy, { indian }),
    price: (v) => price(v, ccy, indian),
    scaleLabel: scale.label,
    table: (v, d = 1) => tableNumber(v, scale.div, d, indian),
  };
}

const FmtContext = React.createContext<Fmt>(makeFmt("USD", false));

export function FmtProvider({ value, children }: { value: Fmt; children: React.ReactNode }) {
  return <FmtContext.Provider value={value}>{children}</FmtContext.Provider>;
}

export const useFmt = () => React.useContext(FmtContext);
