"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Bot, Send, UserRound } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import { TextareaField } from "@/components/form-field";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { EmptyState, Feedback } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/lib/axios";
import { formOptions } from "@/lib/form-options";
import { useChatHistory, useSendChatMessage } from "@/modules/chat/hooks/use-chat";
import { chatSchema, type ChatFormData } from "@/modules/chat/schemas/chat.schema";
import type { ChatMessage } from "@/modules/chat/types/chat.types";

function TypingDots({ compact = false }: { compact?: boolean }) {
  const reduced = useReducedMotion();
  if (reduced) return compact ? <span className="text-xs">•••</span> : <span className="text-sm text-zinc-400">Processando...</span>;
  return <span className="flex items-center gap-1" aria-hidden="true">{[0, 1, 2].map((dot) => <motion.span key={dot} className={cn("rounded-full bg-lime-400", compact ? "size-1" : "size-1.5")} animate={{ y: [0, -3, 0], opacity: [0.45, 1, 0.45] }} transition={{ duration: 0.65, repeat: Infinity, delay: dot * 0.12, ease: "easeInOut" }} />)}</span>;
}

function AssistantText({ content, onComplete }: { content: string; onComplete?: () => void }) {
  const reduced = useReducedMotion();
  const [visibleWords, setVisibleWords] = useState(reduced ? Number.POSITIVE_INFINITY : 0);
  const words = content.split(/(\s+)/);
  const complete = visibleWords >= words.length;

  useEffect(() => {
    if (reduced || complete) { onComplete?.(); return; }
    const timer = window.setTimeout(() => setVisibleWords((value) => Math.min(value + 2, words.length)), 20);
    return () => window.clearTimeout(timer);
  }, [complete, onComplete, reduced, visibleWords, words.length]);

  return <p className="whitespace-pre-wrap break-words" aria-label={content} onClick={() => setVisibleWords(words.length)} title={complete ? undefined : "Clique para mostrar a resposta completa"}>{complete ? content : words.slice(0, visibleWords).join("")}</p>;
}

function MessageBubble({ message, onTypingComplete }: { message: ChatMessage; onTypingComplete?: () => void }) {
  const reduced = useReducedMotion();
  return <motion.article layout="position" initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : 0.18, ease: "easeOut" }} aria-label={message.role === "user" ? "Você" : "Assistente"} className={cn("flex gap-3 will-change-[opacity,transform]", message.role === "user" && "justify-end")}>
    {message.role === "assistant" && <Bot aria-hidden="true" className="mt-1 size-5 shrink-0 text-lime-400" />}
    <div className={cn("min-w-0 max-w-2xl rounded-xl border px-4 py-3 text-sm leading-6", message.role === "assistant" ? "border-zinc-800 bg-zinc-950" : "border-lime-400/30 bg-lime-400/10")}>
      {message.role === "assistant" ? <AssistantText content={message.content} onComplete={onTypingComplete} /> : <p className="whitespace-pre-wrap break-words">{message.content}</p>}
    </div>
    {message.role === "user" && <UserRound aria-hidden="true" className="mt-1 size-5 shrink-0 text-zinc-400" />}
  </motion.article>;
}

export function ChatView() {
  const [serverError, setServerError] = useState<string | null>(null);
  const chatHistory = useChatHistory();
  const sendMessage = useSendChatMessage();
  const reduced = useReducedMotion();
  const endRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const { register, handleSubmit, reset, setFocus, formState: { errors, touchedFields, isSubmitted } } = useForm<ChatFormData>({ ...formOptions, resolver: zodResolver(chatSchema), defaultValues: { message: "" } });

  const updateNearBottom = useCallback(() => { nearBottomRef.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160; }, []);
  const scrollToEnd = useCallback(() => { if (nearBottomRef.current) endRef.current?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" }); }, [reduced]);

  useEffect(() => { updateNearBottom(); window.addEventListener("scroll", updateNearBottom, { passive: true }); return () => window.removeEventListener("scroll", updateNearBottom); }, [updateNearBottom]);
  const messages = useMemo(() => chatHistory.data?.messages ?? [], [chatHistory.data?.messages]);
  useEffect(() => { requestAnimationFrame(scrollToEnd); }, [messages, scrollToEnd, sendMessage.isPending]);

  const onSubmit = handleSubmit(async ({ message }) => {
    if (sendMessage.isPending) return;
    setServerError(null);
    const shouldFollow = nearBottomRef.current;
    nearBottomRef.current = shouldFollow;
    try {
      await sendMessage.mutateAsync({ message });
      reset();
    } catch (error) {
      setServerError(getApiErrorMessage(error, "Não foi possível enviar a mensagem. Seu texto foi mantido; tente novamente."));
    }
    requestAnimationFrame(() => setFocus("message"));
  });

  return <div className="flex min-h-[calc(100dvh-10rem)] min-w-0 flex-col md:min-h-[calc(100dvh-4rem)]">
    <PageHeading eyebrow="Parceiro de criação" title="Assistente" description="Explore ideias e organize o desenvolvimento do seu jogo." />
    <section className="mt-8 flex-1 space-y-5" role="log" aria-label="Conversa com o assistente" aria-relevant="additions text">
      {chatHistory.isLoading && <EmptyState title="Carregando conversa"><p>Buscando seu histórico de mensagens...</p></EmptyState>}
      {chatHistory.isError && <Feedback error>Não foi possível carregar o histórico da conversa.</Feedback>}
      {!chatHistory.isLoading && !chatHistory.isError && messages.length === 0 && <EmptyState title="Comece uma conversa"><p>Peça ajuda com uma mecânica, organize decisões ou transforme seu progresso em notas de atualização.</p></EmptyState>}
      {messages.map((message) => <MessageBubble key={message.id} message={message} onTypingComplete={scrollToEnd} />)}
      <AnimatePresence initial={false}>
        {sendMessage.isPending && <motion.article key="processing" role="status" aria-label="Assistente processando" className="flex gap-3" initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: reduced ? 0 : 0.15 }}><Bot aria-hidden="true" className="mt-1 size-5 shrink-0 text-lime-400" /><div className="flex h-12 items-center rounded-xl border border-zinc-800 bg-zinc-950 px-4"><TypingDots /></div></motion.article>}
      </AnimatePresence>
      <div ref={endRef} />
    </section>
    <form onSubmit={onSubmit} onChange={() => setServerError(null)} aria-busy={sendMessage.isPending} className="sticky bottom-0 mt-6 space-y-3 border-t border-zinc-800 bg-background py-4" noValidate>
      <TextareaField id="message" label="Sua mensagem" placeholder="Descreva uma mecânica ou conte o que você desenvolveu..." rows={3} disabled={sendMessage.isPending} hint="Até 2.000 caracteres. Enter envia; Shift + Enter insere uma nova linha." error={touchedFields.message || isSubmitted ? errors.message?.message : undefined} {...register("message")} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!sendMessage.isPending) event.currentTarget.form?.requestSubmit(); } }} />
      {serverError && <Feedback error>{serverError}</Feedback>}
      <div className="flex justify-end"><Button type="submit" disabled={sendMessage.isPending} aria-busy={sendMessage.isPending}><span className="relative flex size-4 items-center justify-center"><AnimatePresence initial={false} mode="wait">{sendMessage.isPending ? <motion.span key="dots" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><TypingDots compact /></motion.span> : <motion.span key="send" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Send aria-hidden="true" className="size-4" /></motion.span>}</AnimatePresence></span>{sendMessage.isPending ? "Enviando..." : "Enviar mensagem"}</Button></div>
    </form>
  </div>;
}
