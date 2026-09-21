"use client";

import { BookOpenText, Cpu, MessagesSquare, Timer } from "lucide-react";
import Link from "next/link";
import { DashboardHeading } from "./dashboard-heading";
import { AnimatedGroup } from "@/components/motion-primitives/animated-group";
import { AnimatedNumber } from "@/components/motion-primitives/animated-number";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/feedback";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardMetrics } from "@/modules/dashboard/hooks/use-dashboard";
import { useDevlogEntries } from "@/modules/devlog/hooks/use-devlog";

export function DashboardView() {
  const metrics = useDashboardMetrics();
  const entries = useDevlogEntries();

  const heading = <DashboardHeading />;
  if (metrics.isLoading || entries.isLoading) return <div className="space-y-8">{heading}<LoadingState label="Carregando seu resumo..." /></div>;
  if (metrics.isError || entries.isError || !metrics.data || !entries.data) return <div className="space-y-8">{heading}<ErrorState message="Não foi possível carregar seu resumo." pending={metrics.isFetching || entries.isFetching} retry={() => { void metrics.refetch(); void entries.refetch(); }} /></div>;

  const cards = [
    { label: "Devlogs registrados", value: metrics.data.totalEntries, icon: BookOpenText, animated: true },
    { label: "Tokens consumidos", value: metrics.data.tokensUsed, icon: Cpu, animated: true },
    { label: "Tempo de uso", value: metrics.data.activeTime, icon: Timer, animated: false },
    { label: "Mensagens trocadas", value: metrics.data.messagesExchanged, icon: MessagesSquare, animated: true },
  ];

  return (
    <div className="space-y-8">
      {heading}
      <section aria-label="Estatísticas do projeto">
        <AnimatedGroup className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, animated }) => (
          <Card key={label} variant="stat">
            <CardContent>
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-muted-foreground">{label}</p>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-lime-400/20 bg-lime-400/5"><Icon aria-hidden="true" className="size-4 text-lime-400" /></span>
              </div>
              <p className="mt-4 break-words font-mono text-2xl font-semibold tracking-tight tabular-nums">
                {animated && typeof value === "number" ? <AnimatedNumber value={value} format="number" /> : value}
              </p>
              {label === "Tokens consumidos" && <p className="mt-3 text-xs leading-5 text-muted-foreground">Tokens: unidades de texto processadas.</p>}
            </CardContent>
          </Card>
        ))}
        </AnimatedGroup>
      </section>
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between"><CardTitle>Últimas entradas</CardTitle><Link href="/devlog" className="text-sm text-lime-400 hover:text-lime-300">Ver devlog</Link></CardHeader>
        <CardContent className="space-y-5">
          {entries.data.entries.length === 0 && <EmptyState title="Nenhuma entrada ainda"><Link href="/devlog" className="text-lime-400 underline underline-offset-4">Escreva seu primeiro registro no devlog.</Link></EmptyState>}
          {entries.data.entries.slice(0, 3).map((entry) => (
            <article key={entry.id} className="border-t border-zinc-800 pt-5 first:border-0 first:pt-0">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="break-words font-medium">{entry.title}</h3><time dateTime={entry.createdAt} className="font-mono text-xs text-zinc-500">{new Date(entry.createdAt).toLocaleDateString("pt-BR")}</time></div>
              <p className="mt-2 line-clamp-2 break-words text-sm leading-6 text-zinc-400">{entry.content}</p>
              <div className="mt-3 flex flex-wrap gap-2">{entry.tags.map((tag, index) => <Badge key={tag + index} variant="secondary">{tag}</Badge>)}</div>
            </article>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
