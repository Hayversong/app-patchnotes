export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  tokensUsed?: number;
};

export type GetChatHistoryResponse = {
  messages: ChatMessage[];
};

export type SendChatRequest = { message: string; context?: string };

export type SendChatResponse = ChatMessage & {
  role: "assistant";
  tokensUsed: number;
};

/**
 * Estado da conexão do chat: connecting (abrindo), open (pronta), reconnecting (caiu; nova tentativa agendada),
 * idle (fechada por inatividade; reabre no próximo envio) e closed (sessão encerrada).
 */
export type ChatSocketStatus = "connecting" | "open" | "reconnecting" | "idle" | "closed";

/** Eventos enviados pelo servidor em /ws/chat (ver docs/API_CONTRACTS.md, Parte 2). */
export type ChatSocketServerEvent =
  | { type: "ready" }
  | { type: "start" }
  | { type: "token"; content: string }
  | { type: "done"; done: true; tokens: number; message: SendChatResponse }
  | { type: "error"; code: string; message: string };

export type SendChatVariables = SendChatRequest & {
  /** Recebe cada trecho da resposta quando o envio é por WebSocket (streaming). */
  onToken?: (content: string) => void;
  /** Chamado com a resposta antes de o histórico ser recarregado. */
  onComplete?: (message: SendChatResponse) => void;
};
