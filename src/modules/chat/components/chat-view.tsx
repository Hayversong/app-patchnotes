"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Bot, Send, UserRound } from "lucide-react";
import { TextShimmer } from "@/components/motion-primitives/text-shimmer";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import { TextareaField } from "@/components/form-field";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { EmptyState, Feedback } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/lib/axios";
import { formOptions } from "@/lib/form-options";
import { useSendChatMessage } from "@/modules/chat/hooks/use-chat";
import { chatSchema, type ChatFormData } from "@/modules/chat/schemas/chat.schema";
import type { ChatMessage } from "@/modules/chat/types/chat.types";

export function ChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const sendMessage = useSendChatMessage();
  const endRef = useRef<HTMLDivElement>(null);
  const shouldScroll = useRef(false);
  const { register, handleSubmit, reset, setFocus, formState: { errors } } = useForm<ChatFormData>({
    ...formOptions, resolver: zodResolver(chatSchema), defaultValues: { message: "" },
  });
  useEffect(() => {
    if (shouldScroll.current) endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, sendMessage.isPending]);

  const onSubmit = handleSubmit(async ({ message }) => {
    if (sendMessage.isPending) return;
    setServerError(null);
    shouldScroll.current = true;
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: message };
    setMessages((current) => [...current, userMessage]);
    try {
      const response = await sendMessage.mutateAsync({ message });
      setMessages((current) => [...current, response]);
      reset();
    } catch (error) {
      setMessages((current) => current.filter((item) => item.id !== userMessage.id));
      setServerError(getApiErrorMessage(error, "Não foi possível enviar a mensagem. Seu texto foi mantido; tente novamente."));
    }
    requestAnimationFrame(() => setFocus("message"));
  });

  return (
    <div className="flex min-h-[calc(100dvh-10rem)] min-w-0 flex-col md:min-h-[calc(100dvh-4rem)]">
      <PageHeading eyebrow="Parceiro de criação" title="Assistente" description="Explore ideias e organize o desenvolvimento do seu jogo." />
      <section className="mt-8 flex-1 space-y-5" role="log" aria-label="Conversa com o assistente" aria-relevant="additions text">
        {messages.length === 0 && <EmptyState title="Comece uma conversa"><p>Peça ajuda com uma mecânica, organize decisões ou transforme seu progresso em notas de atualização.</p></EmptyState>}
        {messages.map((message) => (
          <article key={message.id} aria-label={message.role === "user" ? "Você" : "Assistente"} className={cn("flex gap-3", message.role === "user" && "justify-end")}>
            {message.role === "assistant" && <Bot aria-hidden="true" className="mt-1 size-5 shrink-0 text-lime-400" />}
            <div className={cn("min-w-0 max-w-2xl rounded-xl border px-4 py-3 text-sm leading-6", message.role === "assistant" ? "border-zinc-800 bg-zinc-950" : "border-lime-400/30 bg-lime-400/10")}><p className="whitespace-pre-wrap break-words">{message.content}</p></div>
            {message.role === "user" && <UserRound aria-hidden="true" className="mt-1 size-5 shrink-0 text-zinc-400" />}
          </article>
        ))}
        {sendMessage.isPending && <p role="status" className="flex items-center gap-2 text-sm text-zinc-400"><Bot aria-hidden="true" className="size-4 text-lime-400" /><TextShimmer>Preparando resposta...</TextShimmer></p>}
        <div ref={endRef} />
      </section>
      <form onSubmit={onSubmit} onChange={() => setServerError(null)} aria-busy={sendMessage.isPending} className="sticky bottom-0 mt-6 space-y-3 border-t border-zinc-800 bg-background py-4" noValidate>
        <TextareaField id="message" label="Sua mensagem" placeholder="Descreva uma mecânica ou conte o que você desenvolveu..." rows={3} readOnly={sendMessage.isPending} hint="Até 2.000 caracteres. Enter envia; Shift + Enter insere uma nova linha." error={errors.message?.message} {...register("message")}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (!sendMessage.isPending) event.currentTarget.form?.requestSubmit();
            }
          }} />
        {serverError && <Feedback error>{serverError}</Feedback>}
        <div className="flex justify-end"><Button type="submit" loading={sendMessage.isPending} loadingText="Enviando..."><Send aria-hidden="true" /> Enviar mensagem</Button></div>
      </form>
    </div>
  );
}
