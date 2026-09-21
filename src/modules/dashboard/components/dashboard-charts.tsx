"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { ErrorState, LoadingState } from "@/components/ui/feedback";
import { useActivityHeatmap, useEntriesByTag, useTokenUsage } from "@/modules/dashboard/hooks/use-dashboard";

function PanelState({ loading, error, retry }: { loading: boolean; error: boolean; retry: () => void }) { if (loading) return <LoadingState label="Carregando gráfico..." />; if (error) return <ErrorState message="Não foi possível carregar este gráfico." pending={false} retry={retry} />; return null; }

export function ActivityHeatmap() {
  const query = useActivityHeatmap();
  const max = Math.max(...(query.data?.days.map((day) => day.count) ?? [1]));
  return <Card><CardHeader><CardTitle>Atividade de devlog</CardTitle><CardDescription>Últimos 90 dias</CardDescription></CardHeader><CardContent><PanelState loading={query.isLoading} error={query.isError} retry={() => void query.refetch()} />{query.data && <div className="grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto pb-1" aria-label="Heatmap de atividade">{query.data.days.map((day) => <div key={day.date} title={`${day.date}: ${day.count} ${day.count === 1 ? "entrada" : "entradas"}`} className="size-3 shrink-0 rounded-[2px] sm:size-4" style={{ backgroundColor: day.count === 0 ? "#1f2937" : `rgb(${Math.round(163 - (day.count / max) * 70)} ${Math.round(230 - (day.count / max) * 45)} ${Math.round(53 - (day.count / max) * 20)} / ${0.35 + day.count / max * 0.65})` }} />)}</div>}</CardContent></Card>;
}

export function TokenUsageChart() {
  const [period, setPeriod] = useState<"7d" | "30d">("7d"); const query = useTokenUsage(period);
  const points = query.data?.points.map((point) => ({ ...point, label: new Date(`${point.date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) })) ?? [];
  return <Card><CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle>Uso de tokens</CardTitle><CardDescription>Consumo do assistente</CardDescription></div><div className="flex rounded-sm border border-zinc-800 p-0.5 text-xs"><button onClick={() => setPeriod("7d")} className={`px-2 py-1 ${period === "7d" ? "rounded bg-lime-400 text-zinc-950" : "text-zinc-400"}`}>7d</button><button onClick={() => setPeriod("30d")} className={`px-2 py-1 ${period === "30d" ? "rounded bg-lime-400 text-zinc-950" : "text-zinc-400"}`}>30d</button></div></CardHeader><CardContent className="h-64"><PanelState loading={query.isLoading} error={query.isError} retry={() => void query.refetch()} />{query.data && <ChartContainer config={{ tokens: { label: "Tokens", color: "#a3e635" } }}><ResponsiveContainer width="100%" height="100%"><LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}><CartesianGrid stroke="#374151" strokeDasharray="3 3" vertical={false} opacity={0.45} /><XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} interval={period === "30d" ? 6 : 0} /><YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} width={42} /><ChartTooltip content={<ChartTooltipContent />} /><Line type="monotone" dataKey="tokens" stroke="#a3e635" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></ChartContainer>}</CardContent></Card>;
}

export function EntriesByTagChart() {
  const query = useEntriesByTag(); const tags = useMemo(() => [...(query.data?.tags ?? [])].sort((a, b) => b.count - a.count), [query.data]);
  return <Card><CardHeader><CardTitle>Entradas por tag</CardTitle><CardDescription>Onde seu desenvolvimento está concentrado</CardDescription></CardHeader><CardContent className="h-64"><PanelState loading={query.isLoading} error={query.isError} retry={() => void query.refetch()} />{query.data && <ChartContainer config={{ count: { label: "Entradas", color: "#a3e635" } }}><ResponsiveContainer width="100%" height="100%"><BarChart data={tags} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 8 }}><CartesianGrid stroke="#374151" strokeDasharray="3 3" horizontal={false} opacity={0.45} /><XAxis type="number" allowDecimals={false} tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis type="category" dataKey="tag" width={72} tick={{ fill: "#d1d5db", fontSize: 11 }} tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="count" fill="#a3e635" radius={[0, 3, 3, 0]}>{tags.map((tag) => <Cell key={tag.tag} fill="#a3e635" fillOpacity={0.55 + tag.count / Math.max(...tags.map((item) => item.count)) * 0.45} />)}</Bar></BarChart></ResponsiveContainer></ChartContainer>}</CardContent></Card>;
}
