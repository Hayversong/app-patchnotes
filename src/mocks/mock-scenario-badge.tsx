"use client";

import { FlaskConical } from "lucide-react";

import { useMockScenarioStore } from "./scenario-store";

/** Aviso exibido somente em desenvolvimento quando um cenário `?mock=` está ativo. */
export function MockScenarioBadge() {
  const scenarios = useMockScenarioStore((state) => state.scenarios);
  const clear = useMockScenarioStore((state) => state.clear);
  const active = Object.entries(scenarios);
  if (active.length === 0) return null;

  return (
    <div role="status" className="fixed left-1/2 top-2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-amber-400/40 bg-zinc-950/95 px-3 py-1.5 font-mono text-xs text-amber-300 shadow-lg">
      <FlaskConical aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="truncate">MSW: {active.map(([domain, scenario]) => `${domain} → ${scenario}`).join(" · ")}</span>
      <button type="button" onClick={clear} className="shrink-0 rounded-full px-2 py-0.5 text-zinc-300 underline underline-offset-2 hover:text-white">Limpar</button>
    </div>
  );
}
