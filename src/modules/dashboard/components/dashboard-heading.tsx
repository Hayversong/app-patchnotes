"use client";

import { useEffect, useState } from "react";
import { PageHeading } from "@/components/page-heading";
import { getGreeting } from "@/lib/getGreeting";
import { useAuthStore } from "@/store/authStore";

export function DashboardHeading() {
  const name = useAuthStore((state) => state.user?.name);
  const [visit, setVisit] = useState<{ date: Date; choice: number }>();
  useEffect(() => {
    setVisit({ date: new Date(), choice: Math.random() });
  }, []);
  const title = visit ? getGreeting(name, visit.date, () => visit.choice) : "Bem-vindo de volta";
  return <PageHeading eyebrow="Visão geral" title={title} description="Acompanhe o progresso do seu jogo e seus últimos registros." />;
}
