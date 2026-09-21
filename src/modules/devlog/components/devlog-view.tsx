"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { AnimatedGroup } from "@/components/motion-primitives/animated-group";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { FormField, TextareaField } from "@/components/form-field";
import { DiscardChanges } from "@/components/discard-changes";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, Feedback, LoadingState } from "@/components/ui/feedback";
import { getApiErrorMessage } from "@/lib/axios";
import { formOptions } from "@/lib/form-options";
import { useCreateDevlogEntry, useDevlogEntries } from "@/modules/devlog/hooks/use-devlog";
import { devlogSchema, type DevlogFormData } from "@/modules/devlog/schemas/devlog.schema";

export function DevlogView() {
  const entries = useDevlogEntries();
  const createEntry = useCreateDevlogEntry();
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const { register, handleSubmit, reset, setFocus, formState: { errors, isDirty } } = useForm<DevlogFormData>({
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
          <AnimatedGroup className="space-y-4">
          {entries.data?.entries.map((entry) => (
            <Card key={entry.id}><CardContent>
              <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="break-words text-lg font-semibold">{entry.title}</h2><time dateTime={entry.createdAt} className="font-mono text-xs text-zinc-500">{new Date(entry.createdAt).toLocaleString("pt-BR")}</time></div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-400">{entry.content}</p>
              {entry.tags.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{entry.tags.map((tag, index) => <Badge key={tag + index} variant="secondary">{tag}</Badge>)}</div>}
            </CardContent></Card>
          ))}
          </AnimatedGroup>
        </section>
        <aside className="min-w-0 lg:sticky lg:top-8"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Plus aria-hidden="true" className="size-5 text-lime-400" /> Nova entrada</CardTitle></CardHeader><CardContent>
          <form onSubmit={onSubmit} onChange={() => setFeedback(null)} aria-busy={createEntry.isPending} noValidate>
            <fieldset disabled={createEntry.isPending} className="min-w-0 space-y-5">
              <FormField id="title" label="Título" hint="Resuma seu progresso em pelo menos 3 caracteres." error={errors.title?.message} {...register("title")} />
              <TextareaField id="content" label="Progresso" rows={7} hint="O que você desenvolveu ou aprendeu? Use pelo menos 10 caracteres." error={errors.content?.message} {...register("content")} />
              <FormField id="tags" label="Marcadores (opcional)" hint="Separe por vírgulas. Exemplo: gameplay, combate." error={errors.tags?.message} {...register("tags")} />
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
