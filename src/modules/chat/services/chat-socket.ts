import { refreshAccessToken } from "@/lib/axios";
import { resolveChatSocketUrl } from "@/lib/config";
import type { ChatSocketServerEvent, ChatSocketStatus, SendChatRequest, SendChatResponse } from "@/modules/chat/types/chat.types";
import { useAuthStore } from "@/store/authStore";

const CONNECT_TIMEOUT_MS = 10_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 15_000;

/** Códigos de fechamento definidos pelo backend (backend/app/routers/ws_chat.py). */
const CLOSE_NORMAL = 1000;
const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_IDLE = 4408;
const CLOSE_TOO_MANY = 4429;

const CONNECTION_LOST = "A conexão com o assistente caiu durante a resposta. Seu texto foi mantido; tente novamente.";
const SESSION_EXPIRED = "Sessão inválida ou expirada. Entre novamente.";

/** Erro do chat por WebSocket com mensagem pronta para exibir. */
export class ChatStreamError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ChatStreamError";
  }
}

export type ChatSocketState = { status: ChatSocketStatus; attempt: number };

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
 * Conexão do chat com /ws/chat enquanto a tela do chat estiver aberta.
 *
 * - Autentica com a primeira mensagem (o token nunca vai na URL).
 * - Se a conexão cair, avisa pelo status "reconnecting" e tenta de novo com espera crescente (1s, 2s, 4s... até 15s).
 * - Token expirado (4401): renova pelo /auth/refresh e reconecta; se a renovação falhar, a sessão é encerrada.
 * - Inatividade (4408): o servidor fecha para poupar recursos; a conexão volta sozinha no próximo envio.
 * - Uma resposta por vez: o formulário fica bloqueado até o "done".
 */
export class ChatSocket {
  private socket: WebSocket | null = null;
  private connecting: Promise<WebSocket> | null = null;
  private pending: PendingReply | null = null;
  private reconnectTimer: number | null = null;
  private stopped = false;
  /** Muda a cada stop(): eventos de sockets de uma "geração" anterior são ignorados. */
  private generation = 0;
  private state: ChatSocketState = { status: "connecting", attempt: 0 };
  private readonly listeners = new Set<(state: ChatSocketState) => void>();

  /** `url`: endereço completo (ws://...) ou caminho relativo à página (/ws/chat). */
  constructor(private readonly url: string) {}

  getState(): ChatSocketState {
    return this.state;
  }

  subscribe(listener: (state: ChatSocketState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Abre a conexão assim que a tela monta, para o aviso de queda aparecer mesmo antes do primeiro envio. */
  start() {
    this.stopped = false;
    this.connect().catch(() => undefined); // falhas já viram status + nova tentativa
  }

  /** Reconecta agora, sem esperar o próximo intervalo (botão "Reconectar"). */
  reconnectNow() {
    this.clearReconnectTimer();
    this.start();
  }

  stop() {
    this.stopped = true;
    this.generation += 1;
    this.clearReconnectTimer();
    this.connecting = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close(CLOSE_NORMAL);
    this.settle(new ChatStreamError("closed", CONNECTION_LOST));
  }

  async send(request: SendChatRequest, onToken?: (content: string) => void): Promise<SendChatResponse> {
    if (this.pending) throw new ChatStreamError("busy", "Aguarde a resposta atual terminar.");
    try {
      return await this.sendOnce(request, onToken);
    } catch (error) {
      // Token expirado: o servidor recusa ANTES de processar a mensagem, então renovar e reenviar é seguro.
      if (!(error instanceof ChatStreamError) || error.code !== "unauthorized") throw error;
      if (!(await refreshAccessToken())) throw error;
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

  private setState(next: ChatSocketState) {
    if (next.status === this.state.status && next.attempt === this.state.attempt) return;
    this.state = next;
    this.listeners.forEach((listener) => listener(next));
  }

  private connect(): Promise<WebSocket> {
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve(this.socket);
    if (!this.connecting) {
      const attempt = this.open().finally(() => {
        if (this.connecting === attempt) this.connecting = null;
      });
      this.connecting = attempt;
    }
    return this.connecting;
  }

  private open(): Promise<WebSocket> {
    return new Promise<WebSocket>((resolve, reject) => {
      const token = useAuthStore.getState().token;
      if (!token) {
        reject(new ChatStreamError("unauthorized", SESSION_EXPIRED));
        return;
      }
      if (this.state.status !== "reconnecting") this.setState({ status: "connecting", attempt: 0 });

      const generation = this.generation;
      const socket = new WebSocket(resolveChatSocketUrl(this.url));
      let ready = false;
      const timer = window.setTimeout(() => socket.close(), CONNECT_TIMEOUT_MS);

      socket.onopen = () => socket.send(JSON.stringify({ type: "auth", token }));
      socket.onmessage = (message) => {
        if (generation !== this.generation) return;
        const event = parseEvent(message.data);
        if (!event) return;
        if (event.type === "ready") {
          ready = true;
          window.clearTimeout(timer);
          this.socket = socket;
          this.setState({ status: "open", attempt: 0 });
          resolve(socket);
          return;
        }
        this.handle(event);
      };
      socket.onclose = (event) => {
        window.clearTimeout(timer);
        if (this.socket === socket) this.socket = null;
        if (generation !== this.generation) {
          if (!ready) reject(new ChatStreamError("closed", CONNECTION_LOST));
          return;
        }
        const error = this.closeError(event.code, ready);
        if (!ready) reject(error);
        this.settle(error);
        if (!this.stopped) void this.afterClose(event.code);
      };
    });
  }

  private closeError(code: number, wasReady: boolean): ChatStreamError {
    if (code === CLOSE_UNAUTHORIZED) return new ChatStreamError("unauthorized", SESSION_EXPIRED);
    if (code === CLOSE_TOO_MANY) return new ChatStreamError("too_many", "Há conexões demais abertas com o assistente. Feche outras abas do chat.");
    return new ChatStreamError("connection_lost", wasReady ? CONNECTION_LOST : "Não foi possível conectar ao assistente.");
  }

  private async afterClose(code: number) {
    if (code === CLOSE_IDLE) {
      this.setState({ status: "idle", attempt: 0 });
      return;
    }
    if (code === CLOSE_UNAUTHORIZED) {
      // Se a renovação falhar, refreshAccessToken encerra a sessão e o app volta ao login.
      if (!(await refreshAccessToken())) {
        this.setState({ status: "closed", attempt: 0 });
        return;
      }
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer !== null) return;
    const attempt = this.state.status === "reconnecting" ? this.state.attempt + 1 : 1;
    this.setState({ status: "reconnecting", attempt });
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** (attempt - 1), RECONNECT_MAX_MS);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => undefined);
    }, delay);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer === null) return;
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
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
