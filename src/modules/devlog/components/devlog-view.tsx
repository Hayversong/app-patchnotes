"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { AnimatedGroup } from "@/components/motion-primitives/animated-group";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { FormField, TextareaField } from "@/components/form-field";
import { DiscardChanges } from "@/components/discard-changes";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, Feedback, LoadingState } from "@/components/ui/feedback";
import { getApiErrorMessage } from "@/lib/axios";
import { cn } from "@/lib/utils";
import { formOptions } from "@/lib/form-options";
import { useCreateDevlogEntry, useDevlogEntries } from "@/modules/devlog/hooks/use-devlog";
import { devlogSchema, type DevlogFormData } from "@/modules/devlog/schemas/devlog.schema";

export function DevlogView() {
  const entries = useDevlogEntries();
  const createEntry = useCreateDevlogEntry();
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const allEntries = useMemo(() => entries.data?.entries ?? [], [entries.data]);
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    allEntries.forEach((entry) => entry.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [allEntries]);
  const activeFilter = tagFilter && tagCounts.some(([tag]) => tag === tagFilter) ? tagFilter : null;
  const visible = activeFilter ? allEntries.filter((entry) => entry.tags.includes(activeFilter)) : allEntries;
  const { register, handleSubmit, reset, setFocus, formState: { errors, touchedFields, isSubmitted, isDirty } } = useForm<DevlogFormData>({
    ...formOptions, resolver: zodResolver(devlogSchema), defaultValues: { title: "", content: "", tags: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFeedback(null);
    try {
      await createEntry.mutateAsync({
        title: values.title, content: values.content,
        tags: values.tags?.split(",").map((tag) => tag.trim()).filter(Boolean),
      });
      reset();
      setFeedback({ message: "Entrada salva no seu diário." });
    } catch (error) {
      setFeedback({ message: getApiErrorMessage(error, "Não foi possível salvar a entrada. Seu texto foi mantido; tente novamente."), error: true });
    }
  });

  return (
    <div className="space-y-8">
      <PageHeading eyebrow="Histórico de desenvolvimento" title="Devlog" description="Registre avanços, decisões e aprendizados do seu jogo." />
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-label="Entradas do diário" className="min-w-0 space-y-4">
          {entries.isLoading && <LoadingState label="Carregando entradas..." />}
          {entries.isError && <ErrorState message="Não foi possível carregar as entradas." pending={entries.isFetching} retry={() => void entries.refetch()} />}
          {!entries.isError && entries.data?.entries.length === 0 && <EmptyState title="Seu diário começa aqui"><p>Registre o primeiro progresso do seu jogo.</p><Button type="button" variant="link" onClick={() => setFocus("title")}>Escrever primeira entrada</Button></EmptyState>}
          {allEntries.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-zinc-400"><span className="font-mono text-foreground">{visible.length}</span> {visible.length === 1 ? "entrada" : "entradas"}{activeFilter && <> com <span className="font-mono text-lime-400">{activeFilter}</span></>}</p>
            {tagCounts.length > 0 && <div role="group" aria-label="Filtrar por marcador" className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-1">
              {[null, ...tagCounts.map(([tag]) => tag)].map((tag) => {
                const selected = activeFilter === tag;
                return <button key={tag ?? "todas"} type="button" aria-pressed={selected} onClick={() => setTagFilter(tag)} className={cn("shrink-0 rounded-sm border px-2.5 py-1 font-mono text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400", selected ? "border-lime-400 bg-lime-400 text-zinc-950" : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200")}>{tag ?? "todas"}</button>;
              })}
            </div>}
          </div>}
          <AnimatedGroup className="space-y-4">
          {visible.map((entry) => (
            <Card key={entry.id}><CardContent>
              <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="break-words text-lg font-semibold">{entry.title}</h2><time dateTime={entry.createdAt} className="font-mono text-xs text-zinc-500">{new Date(entry.createdAt).toLocaleString("pt-BR")}</time></div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-400">{entry.content}</p>
              {entry.tags.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{entry.tags.map((tag, index) => <Badge key={tag + index} variant="secondary">{tag}</Badge>)}</div>}
            </CardContent></Card>
          ))}
          </AnimatedGroup>
        </section>
        <aside className="order-first min-w-0 lg:order-none lg:sticky lg:top-8"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Plus aria-hidden="true" className="size-5 text-lime-400" /> Nova entrada</CardTitle></CardHeader><CardContent>
          <form method="post" onSubmit={onSubmit} onChange={() => setFeedback(null)} aria-busy={createEntry.isPending} noValidate>
            <fieldset disabled={createEntry.isPending} className="min-w-0 space-y-5">
              <FormField id="title" label="Título" hint="Resuma seu progresso em pelo menos 3 caracteres." error={touchedFields.title || isSubmitted ? errors.title?.message : undefined} {...register("title")} />
              <TextareaField id="content" label="Progresso" rows={7} hint="O que você desenvolveu ou aprendeu? Use pelo menos 10 caracteres." error={touchedFields.content || isSubmitted ? errors.content?.message : undefined} {...register("content")} />
              <FormField id="tags" label="Marcadores (opcional)" hint="Separe por vírgulas. Exemplo: gameplay, combate." error={touchedFields.tags || isSubmitted ? errors.tags?.message : undefined} {...register("tags")} />
              {feedback && <Feedback error={feedback.error}>{feedback.message}</Feedback>}
              <Button type="submit" className="w-full" loading={createEntry.isPending} loadingText="Salvando...">Salvar entrada</Button>
              <DiscardChanges disabled={!isDirty || createEntry.isPending} onConfirm={() => { reset(); setFeedback(null); }} />
            </fieldset>
          </form>
        </CardContent></Card></aside>
      </div>
    </div>
  );
}
