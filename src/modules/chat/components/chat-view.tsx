"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Bot, Coins, Lightbulb, RefreshCw, ScrollText, Send, UserRound, WifiOff } from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import { TextareaField } from "@/components/form-field";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, Feedback, LoadingState } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/lib/axios";
import { formOptions } from "@/lib/form-options";
import { useChatHistory, useChatSocket, useSendChatMessage } from "@/modules/chat/hooks/use-chat";
import { ChatStreamError } from "@/modules/chat/services/chat-socket";
import { chatSchema, type ChatFormData } from "@/modules/chat/schemas/chat.schema";
import type { ChatMessage, ChatSocketStatus } from "@/modules/chat/types/chat.types";
import { useDevlogEntries } from "@/modules/devlog/hooks/use-devlog";
import { useTokenBalance } from "@/modules/tokens/hooks/use-tokens";

const SUGGESTIONS = [
  { title: "Destravar uma mecânica", prompt: "Estou travado numa mecânica do meu jogo. Me faça 3 perguntas para eu entender melhor o problema antes de sugerir soluções." },
  { title: "Notas de atualização", prompt: "Transforme o que eu fiz esta semana em notas de atualização curtas para jogadores. O que eu fiz foi: " },
  { title: "Priorizar o próximo passo", prompt: "Tenho estas tarefas pendentes no meu jogo. Me ajude a escolher a próxima, pensando em impacto e esforço: " },
  { title: "Ideias de feedback", prompt: "Sugira formas simples de dar feedback visual e sonoro quando o jogador acerta um ataque." },
];
const MAX_CONTEXT = 1_500;

function SuggestionButton({ title, prompt, onPick }: { title: string; prompt: string; onPick: (text: string) => void }) {
  return <button type="button" onClick={() => onPick(prompt)} className="group rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-left sm:p-4 transition-colors hover:border-lime-400/40 hover:bg-lime-400/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400">
    <span className="flex items-start gap-2 text-sm font-medium leading-5 text-zinc-200 group-hover:text-lime-300"><Lightbulb aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-lime-400" />{title}</span>
    <span className="mt-1.5 line-clamp-2 hidden text-xs leading-5 text-zinc-500 sm:block">{prompt}</span>
  </button>;
}

/** Painel lateral (telas largas): saldo e atalhos que preenchem o campo a partir dos últimos devlogs. */
function ChatSidePanel({ onPick }: { onPick: (text: string) => void }) {
  const balance = useTokenBalance();
  const entries = useDevlogEntries();
  const recent = entries.data?.entries.slice(0, 3) ?? [];
  return <div className="sticky top-8 space-y-4">
    <Card size="sm"><CardContent className="space-y-2">
      <p className="flex items-center gap-2 text-xs text-zinc-500"><Coins aria-hidden="true" className="size-3.5 text-lime-400" />Saldo de tokens</p>
      <p className="font-mono text-xl font-semibold tabular-nums">{balance.data ? balance.data.balance.toLocaleString("pt-BR") : "–"}</p>
      <Link href="/tokens" className="text-xs text-lime-400 hover:text-lime-300">Ver extrato e recargas</Link>
    </CardContent></Card>
    <Card size="sm">
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><ScrollText aria-hidden="true" className="size-4 text-lime-400" />Do seu devlog</CardTitle><CardDescription className="text-xs leading-5">Escolha uma entrada para virar notas de atualização.</CardDescription></CardHeader>
      <CardContent className="space-y-2">
        {recent.length === 0 ? <p className="text-xs leading-5 text-zinc-500">Nenhuma entrada ainda. <Link href="/devlog" className="text-lime-400 hover:text-lime-300">Escrever no devlog</Link></p> :
        recent.map((entry) => <button key={entry.id} type="button" onClick={() => onPick(`Transforme esta entrada do meu devlog em notas de atualização curtas para jogadores:\n\n${entry.title}\n${entry.content}`.slice(0, MAX_CONTEXT))} className="block w-full rounded-md border border-zinc-800 px-3 py-2 text-left transition-colors hover:border-lime-400/40 hover:bg-lime-400/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400">
          <span className="block truncate text-sm text-zinc-200">{entry.title}</span>
          <span className="block font-mono text-[11px] text-zinc-500">{new Date(entry.createdAt).toLocaleDateString("pt-BR")}</span>
        </button>)}
      </CardContent>
    </Card>
  </div>;
}

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

function MessageBubble({ message, onTypingComplete, typing = true }: { message: ChatMessage; onTypingComplete?: () => void; typing?: boolean }) {
  const reduced = useReducedMotion();
  return <motion.article layout="position" initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : 0.18, ease: "easeOut" }} aria-label={message.role === "user" ? "Você" : "Assistente"} className={cn("flex gap-3 will-change-[opacity,transform]", message.role === "user" && "justify-end")}>
    {message.role === "assistant" && <Bot aria-hidden="true" className="mt-1 size-5 shrink-0 text-lime-400" />}
    <div className={cn("min-w-0 max-w-2xl rounded-xl border px-4 py-3 text-sm leading-6", message.role === "assistant" ? "border-zinc-800 bg-zinc-950" : "border-lime-400/30 bg-lime-400/10")}>
      {message.role === "assistant" && typing ? <AssistantText content={message.content} onComplete={onTypingComplete} /> : <p className="whitespace-pre-wrap break-words">{message.content}</p>}
      {typeof message.tokensUsed === "number" && <p className="mt-2 font-mono text-[11px] text-zinc-500" title={message.role === "user" ? "Tokens de entrada: sistema, contexto, histórico e sua mensagem" : "Tokens gerados na resposta"}>{message.tokensUsed.toLocaleString("pt-BR")} tokens</p>}
    </div>
    {message.role === "user" && <UserRound aria-hidden="true" className="mt-1 size-5 shrink-0 text-zinc-400" />}
  </motion.article>;
}

/** Aviso de conexão: aparece quando o WebSocket cai e some sozinho quando a reconexão dá certo. */
function ConnectionNotice({ status, attempt, onReconnect }: { status: ChatSocketStatus; attempt: number; onReconnect: () => void }) {
  if (status === "open" || status === "idle") return null;
  if (status === "connecting") return <p role="status" className="mt-6 flex items-center gap-2 text-xs text-zinc-400"><TypingDots compact /> Conectando ao assistente...</p>;
  const message = status === "closed" ? "Conexão encerrada. Entre novamente para continuar." : `Conexão com o assistente perdida. Tentando reconectar${attempt > 1 ? ` (tentativa ${attempt})` : ""}...`;
  return <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
    <span className="flex items-center gap-2"><WifiOff aria-hidden="true" className="size-4 shrink-0" />{message}</span>
    {status === "reconnecting" && <Button type="button" variant="outline" size="sm" onClick={onReconnect}><RefreshCw aria-hidden="true" className="size-3.5" />Reconectar agora</Button>}
  </div>;
}

export function ChatView() {
  const [serverError, setServerError] = useState<string | null>(null);
  // Pergunta enviada e resposta parcial enquanto o WebSocket transmite (somem quando o histórico atualiza).
  const [streaming, setStreaming] = useState<{ question: string; answer: string; answerId?: string } | null>(null);
  // Respostas já mostradas via streaming não repetem a animação de digitação.
  const [streamedIds, setStreamedIds] = useState<ReadonlySet<string>>(() => new Set());
  const chatHistory = useChatHistory();
  const connection = useChatSocket();
  const sendMessage = useSendChatMessage(connection.socket);
  // "idle" reabre no próximo envio; nos demais estados sem conexão o envio espera a reconexão.
  const canSend = connection.status === "open" || connection.status === "idle";
  const inputLocked = sendMessage.isPending || !canSend;
  const reduced = useReducedMotion();
  const nearBottomRef = useRef(true);
  const { register, handleSubmit, reset, setFocus, setValue, formState: { errors, touchedFields, isSubmitted } } = useForm<ChatFormData>({ ...formOptions, resolver: zodResolver(chatSchema), defaultValues: { message: "" } });

  const updateNearBottom = useCallback(() => { nearBottomRef.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160; }, []);
  // Rola a página até o fim (e não só até o fim da lista), senão a última mensagem fica atrás do formulário fixo.
  const scrollToEnd = useCallback((instant = false) => { if (nearBottomRef.current) window.scrollTo({ top: document.documentElement.scrollHeight, behavior: reduced || instant ? "auto" : "smooth" }); }, [reduced]);

  useEffect(() => { updateNearBottom(); window.addEventListener("scroll", updateNearBottom, { passive: true }); return () => window.removeEventListener("scroll", updateNearBottom); }, [updateNearBottom]);
  const messages = useMemo(() => chatHistory.data?.messages ?? [], [chatHistory.data?.messages]);
  // Mensagens que já existiam ao abrir a tela aparecem prontas; só respostas novas fazem a animação de digitação.
  const initialIdsRef = useRef<ReadonlySet<string> | null>(null);
  if (initialIdsRef.current === null && chatHistory.data) initialIdsRef.current = new Set(chatHistory.data.messages.map((item) => item.id));
  // Bolhas temporárias do streaming saem no mesmo render em que a resposta entra no histórico.
  const showStreaming = streaming !== null && !(streaming.answerId && messages.some((item) => item.id === streaming.answerId));
  const followEnd = useCallback(() => scrollToEnd(), [scrollToEnd]);
  useEffect(() => { requestAnimationFrame(followEnd); }, [messages, followEnd, sendMessage.isPending]);
  useEffect(() => { if (streaming?.answer) requestAnimationFrame(() => scrollToEnd(true)); }, [streaming?.answer, scrollToEnd]);

  const pickPrompt = useCallback((text: string) => {
    setValue("message", text, { shouldDirty: true });
    setServerError(null);
    requestAnimationFrame(() => setFocus("message"));
  }, [setFocus, setValue]);

  const onSubmit = handleSubmit(async ({ message }) => {
    if (inputLocked) return;
    setServerError(null);
    // Quem acabou de enviar quer ver a resposta: salta para o fim (instantâneo, para o listener de scroll
    // não interpretar posições intermediárias de uma rolagem suave como "a pessoa subiu a conversa").
    nearBottomRef.current = true;
    scrollToEnd(true);
    setStreaming({ question: message, answer: "" });
    try {
      await sendMessage.mutateAsync({
        message,
        onToken: (content) => setStreaming((current) => current && { ...current, answer: current.answer + content }),
        onComplete: (answer) => {
          setStreamedIds((ids) => new Set(ids).add(answer.id));
          setStreaming((current) => current && { ...current, answerId: answer.id });
        },
      });
      reset();
    } catch (error) {
      setServerError(error instanceof ChatStreamError ? error.message : getApiErrorMessage(error, "Não foi possível enviar a mensagem. Seu texto foi mantido; tente novamente."));
    } finally {
      setStreaming(null);
    }
    requestAnimationFrame(() => setFocus("message"));
  });

  return <div className="flex min-h-[calc(100dvh-10rem)] min-w-0 flex-col md:min-h-[calc(100dvh-4rem)]">
    <PageHeading eyebrow="Parceiro de criação" title="Assistente" description="Explore ideias e organize o desenvolvimento do seu jogo." />
    <div className="mt-8 grid flex-1 gap-8 xl:grid-cols-[minmax(0,1fr)_280px]">
    <div className="flex min-w-0 flex-col">
    <section className="flex-1 space-y-5" role="log" aria-label="Conversa com o assistente" aria-relevant="additions text">
      {chatHistory.isLoading && <LoadingState label="Carregando conversa..." />}
      {chatHistory.isError && <ErrorState message="Não foi possível carregar o histórico da conversa." hint="Você ainda pode enviar novas mensagens. Tente recarregar o histórico." pending={chatHistory.isFetching} retry={() => void chatHistory.refetch()} />}
      {!chatHistory.isLoading && !chatHistory.isError && messages.length === 0 && !showStreaming && <div className="rounded-xl border border-dashed border-zinc-800 p-5 sm:p-6">
        <div className="text-center"><h2 className="text-base font-medium">Comece uma conversa</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Peça ajuda com uma mecânica, organize decisões ou transforme seu progresso em notas de atualização.</p></div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:gap-3">{SUGGESTIONS.map((item) => <SuggestionButton key={item.title} {...item} onPick={pickPrompt} />)}</div>
      </div>}
      {messages.map((message) => <MessageBubble key={message.id} message={message} onTypingComplete={followEnd} typing={!streamedIds.has(message.id) && !initialIdsRef.current?.has(message.id)} />)}
      {showStreaming && <article aria-label="Você" className="flex justify-end gap-3"><div className="min-w-0 max-w-2xl rounded-xl border border-lime-400/30 bg-lime-400/10 px-4 py-3 text-sm leading-6"><p className="whitespace-pre-wrap break-words">{streaming.question}</p></div><UserRound aria-hidden="true" className="mt-1 size-5 shrink-0 text-zinc-400" /></article>}
      {showStreaming && streaming.answer && <article aria-label="Assistente respondendo" aria-busy="true" className="flex gap-3">
        <Bot aria-hidden="true" className="mt-1 size-5 shrink-0 text-lime-400" />
        {/* Texto parcial oculto de leitores de tela: a resposta completa é anunciada quando entra no histórico. */}
        <div aria-hidden="true" className="min-w-0 max-w-2xl rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm leading-6"><p className="whitespace-pre-wrap break-words">{streaming.answer}<span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 bg-lime-400 motion-safe:animate-pulse" /></p></div>
        <span className="sr-only" role="status">Assistente respondendo...</span>
      </article>}
      <AnimatePresence initial={false}>
        {sendMessage.isPending && !streaming?.answer && <motion.article key="processing" role="status" aria-label="Assistente processando" className="flex gap-3" initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: reduced ? 0 : 0.15 }}><Bot aria-hidden="true" className="mt-1 size-5 shrink-0 text-lime-400" /><div className="flex h-12 items-center rounded-xl border border-zinc-800 bg-zinc-950 px-4"><TypingDots /></div></motion.article>}
      </AnimatePresence>
    </section>
    <ConnectionNotice status={connection.status} attempt={connection.attempt} onReconnect={connection.reconnectNow} />
    <form method="post" onSubmit={onSubmit} onChange={() => setServerError(null)} aria-busy={sendMessage.isPending} className="sticky bottom-0 mt-6 space-y-3 border-t border-zinc-800 bg-background py-4" noValidate>
      <TextareaField id="message" label="Sua mensagem" placeholder="Descreva uma mecânica ou conte o que você desenvolveu..." rows={3} disabled={inputLocked} hint="Até 2.000 caracteres. Enter envia; Shift + Enter insere uma nova linha." error={touchedFields.message || isSubmitted ? errors.message?.message : undefined} {...register("message")} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!inputLocked) event.currentTarget.form?.requestSubmit(); } }} />
      {serverError && <Feedback error>{serverError}</Feedback>}
      <div className="flex justify-end"><Button type="submit" disabled={inputLocked} aria-busy={sendMessage.isPending}><span className="relative flex size-4 items-center justify-center"><AnimatePresence initial={false} mode="wait">{sendMessage.isPending ? <motion.span key="dots" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><TypingDots compact /></motion.span> : <motion.span key="send" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Send aria-hidden="true" className="size-4" /></motion.span>}</AnimatePresence></span>{sendMessage.isPending ? "Assistente digitando..." : canSend ? "Enviar mensagem" : "Aguardando conexão..."}</Button></div>
    </form>
    </div>
    <aside aria-label="Atalhos do assistente" className="hidden min-w-0 xl:block"><ChatSidePanel onPick={pickPrompt} /></aside>
    </div>
  </div>;
}
