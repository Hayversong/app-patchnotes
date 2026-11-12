import { refreshAccessToken } from "@/lib/axios";
import type { ChatSocketServerEvent, SendChatRequest, SendChatResponse } from "@/modules/chat/types/chat.types";
import { useAuthStore } from "@/store/authStore";

const CONNECT_TIMEOUT_MS = 10_000;
const CLOSE_UNAUTHORIZED = 4401;

/** Erro do chat por WebSocket com mensagem pronta para exibir. */
export class ChatStreamError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ChatStreamError";
  }
}

const CONNECTION_LOST = "A conexão com o assistente caiu. Seu texto foi mantido; tente novamente.";

type PendingReply = {
  onToken?: (content: string) => void;
  resolve: (message: SendChatResponse) => void;
  reject: (error: ChatStreamError) => void;
};

function parseEvent(data: unknown): ChatSocketServerEvent | null {
  if (typeof data !== "string") return null;
  try {
    const value: unknown = JSON.parse(data);
    return typeof value === "object" && value !== null && "type" in value ? (value as ChatSocketServerEvent) : null;
  } catch {
    return null;
  }
}

/**
 * Conexão do chat com /ws/chat. Abre sob demanda, autentica com a primeira mensagem
 * (o token nunca vai na URL) e é reaproveitada entre envios. Uma resposta por vez.
 */
export class ChatSocket {
  private socket: WebSocket | null = null;
  private connecting: Promise<WebSocket> | null = null;
  private pending: PendingReply | null = null;

  constructor(private readonly url: string) {}

  async send(request: SendChatRequest, onToken?: (content: string) => void): Promise<SendChatResponse> {
    if (this.pending) throw new ChatStreamError("busy", "Aguarde a resposta atual terminar.");
    try {
      return await this.sendOnce(request, onToken);
    } catch (error) {
      // Token expirado: o servidor recusa ANTES de processar a mensagem, então renovar e reenviar é seguro.
      if (!(error instanceof ChatStreamError) || error.code !== "unauthorized") throw error;
      const token = await refreshAccessToken(); // se falhar, a sessão é encerrada e o app volta ao login
      if (!token) throw error;
      return this.sendOnce(request, onToken);
    }
  }

  private async sendOnce(request: SendChatRequest, onToken?: (content: string) => void): Promise<SendChatResponse> {
    const socket = await this.connect();
    return new Promise<SendChatResponse>((resolve, reject) => {
      this.pending = { onToken, resolve, reject };
      socket.send(JSON.stringify({ type: "message", ...request }));
    });
  }

  close() {
    this.connecting = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000);
    this.settle(new ChatStreamError("closed", CONNECTION_LOST));
  }

  private connect(): Promise<WebSocket> {
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve(this.socket);
    this.connecting ??= new Promise<WebSocket>((resolve, reject) => {
      const token = useAuthStore.getState().token;
      if (!token) {
        reject(new ChatStreamError("unauthorized", "Sessão inválida ou expirada. Entre novamente."));
        return;
      }
      const socket = new WebSocket(this.url);
      let ready = false;
      const timer = window.setTimeout(() => socket.close(), CONNECT_TIMEOUT_MS);

      socket.onopen = () => socket.send(JSON.stringify({ type: "auth", token }));
      socket.onmessage = (message) => {
        const event = parseEvent(message.data);
        if (!event) return;
        if (event.type === "ready") {
          ready = true;
          window.clearTimeout(timer);
          this.socket = socket;
          resolve(socket);
          return;
        }
        this.handle(event);
      };
      socket.onclose = (event) => {
        window.clearTimeout(timer);
        if (this.socket === socket) this.socket = null;
        this.connecting = null;
        if (event.code === CLOSE_UNAUTHORIZED) {
          // Quem chamou send() tenta renovar o token; se não der, a sessão é encerrada lá.
          const error = new ChatStreamError("unauthorized", "Sessão inválida ou expirada. Entre novamente.");
          if (!ready) reject(error);
          this.settle(error);
          return;
        }
        const error = new ChatStreamError("connection_lost", ready ? CONNECTION_LOST : "Não foi possível conectar ao assistente. Tente novamente.");
        if (!ready) reject(error);
        this.settle(error);
      };
    });
    return this.connecting;
  }

  private handle(event: ChatSocketServerEvent) {
    const pending = this.pending;
    if (!pending) return;
    if (event.type === "token") pending.onToken?.(event.content);
    else if (event.type === "done") {
      this.pending = null;
      pending.resolve(event.message);
    } else if (event.type === "error") this.settle(new ChatStreamError(event.code, event.message));
  }

  private settle(error: ChatStreamError) {
    const pending = this.pending;
    this.pending = null;
    pending?.reject(error);
  }
}
