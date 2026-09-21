"use client";

import { useEffect, useState } from "react";
import { Flame } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { getGreeting } from "@/lib/getGreeting";
import { useAuthStore } from "@/store/authStore";

export function DashboardHeading({ streak }: { streak?: number }) {
  const name = useAuthStore((state) => state.user?.name);
  const [visit, setVisit] = useState<{ date: Date; choice: number }>();
  useEffect(() => { setVisit({ date: new Date(), choice: Math.random() }); }, []);
  const title = visit ? getGreeting(name, visit.date, () => visit.choice) : "Bem-vindo de volta";
  return <PageHeading eyebrow="Visão geral" title={title} description="Acompanhe o progresso do seu jogo e seus últimos registros." aside={<div className="flex min-h-[76px] items-center gap-3 rounded-sm border border-zinc-800 bg-zinc-950 px-4 py-3"><Flame aria-hidden="true" className="size-5 text-lime-400" /><div><p className="font-mono text-2xl font-semibold leading-none text-lime-400">{streak ?? "—"}</p><p className="mt-1 text-xs text-zinc-400">dias seguidos</p></div></div>} />;
}
