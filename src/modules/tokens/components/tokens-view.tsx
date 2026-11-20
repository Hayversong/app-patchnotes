"use client";

import { ArrowDownRight, ArrowUpRight, BatteryCharging, Coins, Gauge } from "lucide-react";
import { useState } from "react";

import { AnimatedNumber } from "@/components/motion-primitives/animated-number";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, Feedback, LoadingState } from "@/components/ui/feedback";
import { getApiErrorMessage } from "@/lib/axios";
import { cn } from "@/lib/utils";
import { TokenUsageChart } from "@/modules/dashboard/components/dashboard-charts";
import { useRechargeTokens, useTokenBalance, useTokenHistory } from "@/modules/tokens/hooks/use-tokens";
import type { TokenBalance, TokenHistoryItem } from "@/modules/tokens/types/tokens.types";

const FALLBACK_PACKAGES = [10_000, 50_000, 100_000];
const number = (value: number) => value.toLocaleString("pt-BR");
const dateTime = (value: string) => new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function BalanceCard({ balance }: { balance: TokenBalance }) {
  const usedPercent = balance.limit > 0 ? Math.min(100, Math.round((balance.used / balance.limit) * 100)) : 100;
  const low = balance.balance <= balance.limit * 0.1;
  const daysLeft = Math.max(1, Math.ceil((new Date(balance.periodEnd).getTime() - Date.now()) / 86_400_000));
  return <Card variant="stat" className="flex flex-col">
    <CardContent className="flex flex-1 flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Saldo atual</p>
          <p className={cn("mt-2 font-mono text-3xl font-semibold tabular-nums", low ? "text-amber-300" : "text-foreground")}><AnimatedNumber value={balance.balance} format="number" /> <span className="text-base text-zinc-500">tokens</span></p>
        </div>
        <span className="flex size-9 items-center justify-center rounded-sm border border-lime-400/20 bg-lime-400/5"><Coins aria-hidden="true" className="size-4 text-lime-400" /></span>
      </div>
      <div>
        <div className="h-2 overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-label="Consumo do mês" aria-valuemin={0} aria-valuemax={100} aria-valuenow={usedPercent}>
          <div className={cn("h-full rounded-full transition-[width]", low ? "bg-amber-400" : "bg-lime-400")} style={{ width: `${usedPercent}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{number(balance.used)} de {number(balance.limit)} usados ({balance.used > 0 && usedPercent === 0 ? "menos de 1" : usedPercent}%)</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-xs">
        <div><dt className="text-zinc-500">Recargas no mês</dt><dd className="mt-1 font-mono text-sm">{number(balance.credits)}</dd></div>
        <div><dt className="text-zinc-500">Renova em</dt><dd className="mt-1 font-mono text-sm">{new Date(balance.periodEnd).toLocaleDateString("pt-BR")}</dd></div>
      </dl>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-md border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-xs">
        <span className="text-zinc-500">Faltam <span className="font-mono text-foreground">{daysLeft}</span> {daysLeft === 1 ? "dia" : "dias"} para renovar</span>
        <span className="text-zinc-500">Dá para usar <span className="font-mono text-lime-400">{number(Math.floor(balance.balance / daysLeft))}</span>/dia</span>
      </div>
      {balance.balance === 0 && <Feedback error>Saldo esgotado: o assistente fica bloqueado até a próxima recarga ou a virada do mês.</Feedback>}
    </CardContent>
  </Card>;
}

/** Quanto o saldo rende, pela média real das últimas respostas (ou uma faixa típica quando ainda não há consumo). */
function BalanceYield({ balance, items }: { balance: number; items: TokenHistoryItem[] }) {
  const usage = items.filter((item) => item.kind === "usage");
  const average = usage.length > 0 ? Math.round(usage.reduce((sum, item) => sum + item.amount, 0) / usage.length) : null;
  return <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
    <p className="flex items-center gap-2 text-sm font-medium"><Gauge aria-hidden="true" className="size-4 text-lime-400" />Quanto rende seu saldo</p>
    {average ? <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
      <div><dt className="text-zinc-500">Média por resposta</dt><dd className="mt-1 font-mono text-sm text-foreground">{number(average)} tokens</dd></div>
      <div><dt className="text-zinc-500">Respostas restantes</dt><dd className="mt-1 font-mono text-sm text-lime-400">≈ {number(Math.floor(balance / Math.max(1, average)))}</dd></div>
    </dl> : <p className="mt-2 text-xs leading-5 text-muted-foreground">Cada resposta gasta os tokens da sua pergunta, do contexto e do texto gerado, em geral de algumas centenas a poucos milhares. Depois da primeira conversa, aqui aparece a sua média real.</p>}
  </div>;
}

function RechargeCard({ packages, balance, items }: { packages: number[]; balance: number; items: TokenHistoryItem[] }) {
  const recharge = useRechargeTokens();
  const [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const onRecharge = (amount: number) => {
    setSelected(amount);
    setMessage(null);
    recharge.mutate(amount, {
      onSuccess: (result) => setMessage({ text: `Recarga de ${number(result.recharged)} tokens concluída. Novo saldo: ${number(result.balance)}.`, error: false }),
      onError: (error) => setMessage({ text: getApiErrorMessage(error, "Não foi possível recarregar agora. Tente novamente."), error: true }),
    });
  };

  return <Card className="flex flex-col">
    <CardHeader><CardTitle className="flex items-center gap-2"><BatteryCharging aria-hidden="true" className="size-4 text-lime-400" />Recarga simulada</CardTitle><CardDescription>Sem cobrança: soma tokens ao saldo do mês para testar o fluxo.</CardDescription></CardHeader>
    <CardContent className="flex flex-1 flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        {packages.map((amount) => <Button key={amount} variant="outline" onClick={() => onRecharge(amount)} loading={recharge.isPending && selected === amount} loadingText="Recarregando..." disabled={recharge.isPending}>+{number(amount)}</Button>)}
      </div>
      {message && <Feedback error={message.error}>{message.text}</Feedback>}
      <div className="mt-auto"><BalanceYield balance={balance} items={items} /></div>
    </CardContent>
  </Card>;
}

function HistoryRow({ item }: { item: TokenHistoryItem }) {
  const usage = item.kind === "usage";
  const Icon = usage ? ArrowDownRight : ArrowUpRight;
  return <li className="flex items-center justify-between gap-4 border-t border-zinc-800 py-3 first:border-0">
    <div className="flex min-w-0 items-center gap-3">
      <Icon aria-hidden="true" className={cn("size-4 shrink-0", usage ? "text-zinc-400" : "text-lime-400")} />
      <div className="min-w-0">
        <p className="truncate text-sm">{usage ? `Resposta do assistente${item.model ? ` · ${item.model}` : ""}` : "Recarga simulada"}</p>
        <p className="text-xs text-zinc-500">
          <time dateTime={item.createdAt}>{dateTime(item.createdAt)}</time>
          {usage && item.promptTokens !== undefined && item.completionTokens !== undefined && ` · ${number(item.promptTokens)} entrada + ${number(item.completionTokens)} saída`}
          {item.estimated && " · estimado"}
        </p>
      </div>
    </div>
    <span className={cn("shrink-0 font-mono text-sm tabular-nums", usage ? "text-zinc-300" : "text-lime-400")}>{usage ? "−" : "+"}{number(item.amount)}</span>
  </li>;
}

export function TokensView() {
  const balance = useTokenBalance();
  const history = useTokenHistory();
  const heading = <PageHeading eyebrow="Consumo do assistente" title="Tokens" description="Acompanhe o saldo do mês, veja cada consumo do modelo e simule recargas." />;

  if (balance.isLoading) return <div className="space-y-8">{heading}<LoadingState label="Carregando saldo..." /></div>;
  if (balance.isError || !balance.data) return <div className="space-y-8">{heading}<ErrorState message="Não foi possível carregar o saldo de tokens." pending={balance.isFetching} retry={() => void balance.refetch()} /></div>;

  return <div className="space-y-8">
    {heading}
    <section className="grid gap-4 lg:grid-cols-2" aria-label="Saldo e recarga">
      <BalanceCard balance={balance.data} />
      <RechargeCard packages={history.data?.packages ?? FALLBACK_PACKAGES} balance={balance.data.balance} items={history.data?.items ?? []} />
    </section>
    <TokenUsageChart />
    <Card>
      <CardHeader><CardTitle>Histórico de consumo</CardTitle><CardDescription>Últimos 20 lançamentos: respostas do modelo e recargas.</CardDescription></CardHeader>
      <CardContent>
        {history.isLoading && <LoadingState label="Carregando histórico..." />}
        {history.isError && <ErrorState message="Não foi possível carregar o histórico." pending={history.isFetching} retry={() => void history.refetch()} />}
        {history.data && history.data.items.length === 0 && <EmptyState title="Nenhum consumo ainda"><p>Converse com o assistente para registrar o uso de tokens.</p></EmptyState>}
        {history.data && history.data.items.length > 0 && <ul aria-label="Lançamentos de tokens">{history.data.items.map((item) => <HistoryRow key={`${item.kind}-${item.id}`} item={item} />)}</ul>}
      </CardContent>
    </Card>
  </div>;
}
