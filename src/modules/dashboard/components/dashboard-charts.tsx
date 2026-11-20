"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/feedback";
import { useActivityHeatmap, useEntriesByTag, useTokenUsage } from "@/modules/dashboard/hooks/use-dashboard";

type PanelQuery = { isLoading: boolean; isError: boolean; isFetching: boolean; refetch: () => unknown };

/** Carregamento, erro com nova tentativa e vazio — comuns a todos os gráficos. Retorna null quando há dados para exibir. */
function PanelState({ query, empty, emptyMessage }: { query: PanelQuery; empty: boolean; emptyMessage: string }) {
  if (query.isLoading) return <LoadingState label="Carregando gráfico..." />;
  if (query.isError) return <ErrorState message="Não foi possível carregar este gráfico." pending={query.isFetching} retry={() => void query.refetch()} />;
  if (empty) return <EmptyState title="Sem dados ainda"><p>{emptyMessage}</p></EmptyState>;
  return null;
}

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const heatColor = (count: number, max: number) => count === 0 ? "#1f2937" : `rgb(${Math.round(163 - (count / max) * 70)} ${Math.round(230 - (count / max) * 45)} ${Math.round(53 - (count / max) * 20)} / ${0.35 + count / max * 0.65})`;

export function ActivityHeatmap() {
  const query = useActivityHeatmap();
  const days = useMemo(() => query.data?.days ?? [], [query.data]);
  const max = Math.max(1, ...days.map((day) => day.count));
  const summary = useMemo(() => {
    const total = days.reduce((sum, day) => sum + day.count, 0);
    const active = days.filter((day) => day.count > 0).length;
    const best = days.reduce<(typeof days)[number] | null>((top, day) => (day.count > (top?.count ?? 0) ? day : top), null);
    const byWeekday = Array.from({ length: 7 }, () => 0);
    days.forEach((day) => { byWeekday[new Date(`${day.date}T12:00:00`).getDay()] += day.count; });
    const topWeekday = Math.max(...byWeekday) > 0 ? WEEKDAYS[byWeekday.indexOf(Math.max(...byWeekday))] : null;
    return { total, active, best, topWeekday };
  }, [days]);
  const facts = [
    { label: "Entradas no período", value: summary.total.toLocaleString("pt-BR") },
    { label: "Dias com registro", value: `${summary.active} de ${days.length}` },
    { label: "Dia mais produtivo", value: summary.best ? `${new Date(`${summary.best.date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} · ${summary.best.count}` : "–" },
    { label: "Você registra mais na", value: summary.topWeekday ?? "–" },
  ];
  return <Card><CardHeader><CardTitle>Atividade de devlog</CardTitle><CardDescription>Últimos 90 dias</CardDescription></CardHeader><CardContent><PanelState query={query} empty={days.length === 0} emptyMessage="Registre entradas no devlog para acompanhar sua atividade." />{days.length > 0 && <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-10">
    <div className="min-w-0 lg:shrink-0">
      <div className="overflow-x-auto pb-1"><div className="grid w-max grid-flow-col grid-rows-7 gap-1" role="img" aria-label={`Mapa de atividade: ${summary.total} entradas em ${summary.active} dias`}>{days.map((day) => <div key={day.date} title={`${new Date(`${day.date}T12:00:00`).toLocaleDateString("pt-BR")}: ${day.count} ${day.count === 1 ? "entrada" : "entradas"}`} className="size-3 rounded-[3px] sm:size-4 xl:size-5" style={{ backgroundColor: heatColor(day.count, max) }} />)}</div></div>
      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-zinc-500" aria-hidden="true">Menos{[0, 0.25, 0.5, 1].map((level) => <span key={level} className="size-3 rounded-[3px]" style={{ backgroundColor: heatColor(level * max, max) }} />)}Mais</div>
    </div>
    <dl className="grid flex-1 grid-cols-2 gap-3 xl:grid-cols-4">
      {facts.map((fact) => <div key={fact.label} className="rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-3"><dt className="text-xs leading-4 text-zinc-500">{fact.label}</dt><dd className="mt-1 font-mono text-sm font-semibold">{fact.value}</dd></div>)}
    </dl>
  </div>}</CardContent></Card>;
}

export function TokenUsageChart() {
  const [period, setPeriod] = useState<"7d" | "30d">("7d"); const query = useTokenUsage(period);
  const points = query.data?.points.map((point) => ({ ...point, label: new Date(`${point.date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) })) ?? [];
  return <Card><CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle>Uso de tokens</CardTitle><CardDescription>Consumo do assistente</CardDescription></div><div className="flex rounded-sm border border-zinc-800 p-0.5 text-xs"><button type="button" aria-pressed={period === "7d"} onClick={() => setPeriod("7d")} className={`px-2 py-1 ${period === "7d" ? "rounded bg-lime-400 text-zinc-950" : "text-zinc-400"}`}>7d</button><button type="button" aria-pressed={period === "30d"} onClick={() => setPeriod("30d")} className={`px-2 py-1 ${period === "30d" ? "rounded bg-lime-400 text-zinc-950" : "text-zinc-400"}`}>30d</button></div></CardHeader><CardContent className="h-64"><PanelState query={query} empty={points.length === 0} emptyMessage="Converse com o assistente para registrar o consumo de tokens." />{points.length > 0 && <ChartContainer config={{ tokens: { label: "Tokens", color: "#a3e635" } }}><ResponsiveContainer width="100%" height="100%"><LineChart data={points} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}><CartesianGrid stroke="#374151" strokeDasharray="3 3" vertical={false} opacity={0.45} /><XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={18} /><YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} width={56} allowDecimals={false} tickFormatter={(value: number) => value.toLocaleString("pt-BR")} /><ChartTooltip content={<ChartTooltipContent />} /><Line type="monotone" dataKey="tokens" stroke="#a3e635" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></ChartContainer>}</CardContent></Card>;
}

export function EntriesByTagChart() {
  const query = useEntriesByTag(); const tags = useMemo(() => [...(query.data?.tags ?? [])].sort((a, b) => b.count - a.count), [query.data]);
  return <Card><CardHeader><CardTitle>Entradas por tag</CardTitle><CardDescription>Onde seu desenvolvimento está concentrado</CardDescription></CardHeader><CardContent className="h-64"><PanelState query={query} empty={tags.length === 0} emptyMessage="Adicione marcadores às entradas do devlog para ver a distribuição." />{tags.length > 0 && <ChartContainer config={{ count: { label: "Entradas", color: "#a3e635" } }}><ResponsiveContainer width="100%" height="100%"><BarChart data={tags} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 8 }}><CartesianGrid stroke="#374151" strokeDasharray="3 3" horizontal={false} opacity={0.45} /><XAxis type="number" allowDecimals={false} tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis type="category" dataKey="tag" width={72} tick={{ fill: "#d1d5db", fontSize: 11 }} tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="count" fill="#a3e635" radius={[0, 3, 3, 0]}>{tags.map((tag) => <Cell key={tag.tag} fill="#a3e635" fillOpacity={0.55 + tag.count / Math.max(...tags.map((item) => item.count)) * 0.45} />)}</Bar></BarChart></ResponsiveContainer></ChartContainer>}</CardContent></Card>;
}
