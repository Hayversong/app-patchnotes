"use client";

import { BookOpenText, Check, Flame, Link2, MessagesSquare } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useDashboardMetrics, useEntriesByTag } from "@/modules/dashboard/hooks/use-dashboard";

type PreviewProps = { name: string; bio: string; githubUrl: string; avatarUrl?: string };

/** "github.com/usuario" a partir da URL; null quando o texto ainda não é uma URL válida (o campo está sendo digitado). */
function githubHandle(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return `${parsed.host}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** Cartão do perfil como ele aparece, atualizado enquanto a pessoa edita o formulário ao lado. */
export function ProfilePreview({ name, bio, githubUrl, avatarUrl }: PreviewProps) {
  const metrics = useDashboardMetrics();
  const tags = useEntriesByTag();
  const handle = githubUrl ? githubHandle(githubUrl) : null;
  const topTags = [...(tags.data?.tags ?? [])].sort((a, b) => b.count - a.count).slice(0, 4);
  const displayName = name.trim() || "Seu nome";

  const stats = [
    { label: "devlogs", value: metrics.data?.totalEntries, icon: BookOpenText },
    { label: metrics.data?.streak === 1 ? "dia seguido" : "dias seguidos", value: metrics.data?.streak, icon: Flame },
    { label: "mensagens", value: metrics.data?.messagesExchanged, icon: MessagesSquare },
  ];

  const checklist = [
    { label: "Foto de perfil", done: Boolean(avatarUrl) },
    { label: "Bio", done: bio.trim().length > 0 },
    { label: "GitHub", done: Boolean(handle) },
    { label: "Primeiro devlog", done: (metrics.data?.totalEntries ?? 0) > 0 },
  ];
  const done = checklist.filter((item) => item.done).length;

  return <div className="space-y-4">
    <Card className="overflow-hidden">
      <div aria-hidden="true" className="h-20 bg-[radial-gradient(circle_at_20%_20%,rgb(163_230_53/0.35),transparent_55%),radial-gradient(circle_at_85%_30%,rgb(20_184_166/0.3),transparent_50%)] bg-zinc-900" />
      <CardContent className="-mt-10 space-y-4">
        <Avatar name={displayName} src={avatarUrl} sizes="80px" className="size-20 rounded-xl border-2 border-zinc-950 text-xl shadow-lg" />
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-lime-400">Prévia do perfil</p>
          <p className="mt-1 break-words text-xl font-semibold">{displayName}</p>
          <p className={cn("mt-2 break-words text-sm leading-6", bio.trim() ? "text-zinc-300" : "italic text-zinc-500")}>{bio.trim() || "Escreva uma bio para contar no que você está trabalhando."}</p>
          {handle && <a href={githubUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex max-w-full items-center gap-2 text-sm text-zinc-400 hover:text-lime-300"><Link2 aria-hidden="true" className="size-4 shrink-0" /><span className="truncate">{handle}</span></a>}
        </div>
        <dl className="grid grid-cols-3 gap-2 border-t border-zinc-800 pt-4">
          {stats.map(({ label, value, icon: Icon }) => <div key={label} className="flex min-w-0 flex-col items-center rounded-md bg-zinc-900/60 px-2 py-3 text-center">
            <Icon aria-hidden="true" className="size-4 text-lime-400" />
            <dt className="order-last max-w-full truncate text-[11px] text-zinc-500">{label}</dt>
            <dd className="mt-1 font-mono text-lg font-semibold tabular-nums">{value ?? "–"}</dd>
          </div>)}
        </dl>
        {topTags.length > 0 && <div>
          <p className="text-xs text-zinc-500">Trabalha mais com</p>
          <div className="mt-2 flex flex-wrap gap-2">{topTags.map((tag) => <Badge key={tag.tag} variant="secondary">{tag.tag}</Badge>)}</div>
        </div>}
      </CardContent>
    </Card>
    <Card size="sm">
      <CardHeader className="pb-3"><CardTitle className="text-base">Perfil completo</CardTitle><CardDescription>{done} de {checklist.length} itens preenchidos</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800" aria-hidden="true"><div className="h-full rounded-full bg-lime-400 transition-[width]" style={{ width: `${(done / checklist.length) * 100}%` }} /></div>
        <ul className="grid grid-cols-2 gap-2 text-xs">
          {checklist.map((item) => <li key={item.label} className={cn("flex items-center gap-2", item.done ? "text-zinc-300" : "text-zinc-500")}>
            <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border", item.done ? "border-lime-400 bg-lime-400 text-zinc-950" : "border-zinc-700")}>{item.done && <Check aria-hidden="true" className="size-3" />}</span>
            {item.label}<span className="sr-only">{item.done ? " (feito)" : " (pendente)"}</span>
          </li>)}
        </ul>
      </CardContent>
    </Card>
  </div>;
}
