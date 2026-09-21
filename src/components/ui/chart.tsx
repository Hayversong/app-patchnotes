"use client";

import * as React from "react";
import { Tooltip as RechartsTooltip } from "recharts";
import { cn } from "@/lib/utils";

const ChartContext = React.createContext<{ config: Record<string, { label?: React.ReactNode; color?: string }> }>({ config: {} });
export function ChartContainer({ config, className, children }: { config: Record<string, { label?: React.ReactNode; color?: string }>; className?: string; children: React.ReactNode }) {
  return <ChartContext.Provider value={{ config }}><div className={cn("h-full w-full", className)}>{children}</div></ChartContext.Provider>;
}
export function ChartTooltipContent({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: string | number; color?: string }>; label?: React.ReactNode }) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs shadow-xl"><p className="mb-1 text-zinc-400">{label}</p>{payload.map((item, index) => <p key={`${item.name}-${index}`} className="font-mono text-zinc-100"><span className="mr-2 inline-block size-2 rounded-full" style={{ backgroundColor: item.color ?? "#a3e635" }} />{item.value?.toLocaleString("pt-BR")}</p>)}</div>;
}
export { RechartsTooltip as ChartTooltip };
