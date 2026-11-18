import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatSocket, ChatStreamError } from "@/modules/chat/services/chat-socket";
import { useAuthStore } from "@/store/authStore";
import { FakeWebSocket } from "@/test/fake-websocket";

// vi.mock é içado para antes dos imports: a ChatSocket já recebe a versão simulada.
const { refreshAccessToken } = vi.hoisted(() => ({ refreshAccessToken: vi.fn<() => Promise<string | null>>() }));
vi.mock("@/lib/axios", () => ({ refreshAccessToken: () => refreshAccessToken() }));

const URL = "ws://localhost:8000/ws/chat";
const answer = { id: "a1", role: "assistant", content: "Olá!", createdAt: "2026-11-18T12:00:00.000Z", tokensUsed: 3 };

/** Deixa promessas e microtarefas pendentes rodarem. */
async function flush() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

function connected(): { chat: ChatSocket; socket: FakeWebSocket } {
  const chat = new ChatSocket(URL);
  chat.start();
  const socket = FakeWebSocket.latest();
  socket.serverAccept();
  return { chat, socket };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeWebSocket);
  FakeWebSocket.reset();
  refreshAccessToken.mockReset();
  useAuthStore.setState({ token: "token-1", user: null, sessionExpired: false });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("conexão", () => {
  it("autentica com a primeira mensagem, sem token na URL, e fica aberta", async () => {
    const chat = new ChatSocket(URL);
    const states: string[] = [];
    chat.subscribe((state) => states.push(state.status));
    chat.start();
    const socket = FakeWebSocket.latest();
    expect(socket.url).toBe(URL);
    expect(chat.getState().status).toBe("connecting");

    socket.serverOpen();
    expect(socket.sent).toEqual([{ type: "auth", token: "token-1" }]);
    socket.serverSend({ type: "ready" });
    await flush();
    expect(chat.getState()).toEqual({ status: "open", attempt: 0 });
    expect(states).toEqual(["open"]);
  });

  it("transmite os tokens e resolve com a mensagem do done", async () => {
    const { chat, socket } = connected();
    const parts: string[] = [];
    const reply = chat.send({ message: "oi" }, (part) => parts.push(part));
    await flush();
    expect(socket.sent.at(-1)).toEqual({ type: "message", message: "oi" });

    socket.serverSend({ type: "start" });
    socket.serverSend({ type: "token", content: "Ol" });
    socket.serverSend({ type: "token", content: "á!" });
    socket.serverSend({ type: "done", done: true, tokens: 3, message: answer });
    await expect(reply).resolves.toEqual(answer);
    expect(parts.join("")).toBe("Olá!");
  });

  it("recusa um segundo envio enquanto a resposta atual não terminou", async () => {
    const { chat } = connected();
    void chat.send({ message: "primeira" });
    await flush();
    await expect(chat.send({ message: "segunda" })).rejects.toMatchObject({ code: "busy" });
  });

  it("evento error rejeita o envio mas mantém a conexão aberta", async () => {
    const { chat, socket } = connected();
    const reply = chat.send({ message: "oi" });
    await flush();
    socket.serverSend({ type: "error", code: "quota_exceeded", message: "Cota mensal esgotada." });
    await expect(reply).rejects.toEqual(new ChatStreamError("quota_exceeded", "Cota mensal esgotada."));
    expect(chat.getState().status).toBe("open");
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});

describe("queda e reconexão", () => {
  it("avisa e reconecta com espera crescente até voltar", async () => {
    const { chat, socket } = connected();
    socket.serverClose(1006);
    await flush();
    expect(chat.getState()).toEqual({ status: "reconnecting", attempt: 1 });

    await vi.advanceTimersByTimeAsync(999);
    expect(FakeWebSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeWebSocket.instances).toHaveLength(2);

    FakeWebSocket.latest().serverClose(1006); // servidor ainda fora
    await flush();
    expect(chat.getState()).toEqual({ status: "reconnecting", attempt: 2 });
    await vi.advanceTimersByTimeAsync(2000);
    expect(FakeWebSocket.instances).toHaveLength(3);

    FakeWebSocket.latest().serverAccept();
    await flush();
    expect(chat.getState()).toEqual({ status: "open", attempt: 0 });
  });

  it("limita a espera entre tentativas a 15 segundos", async () => {
    const { chat, socket } = connected();
    socket.serverClose(1006);
    await flush();
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      await vi.advanceTimersByTimeAsync(Math.min(1000 * 2 ** (attempt - 1), 15_000));
      FakeWebSocket.latest().serverClose(1006);
      await flush();
    }
    expect(chat.getState().attempt).toBe(7);
    const before = FakeWebSocket.instances.length;
    await vi.advanceTimersByTimeAsync(14_999);
    expect(FakeWebSocket.instances).toHaveLength(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeWebSocket.instances).toHaveLength(before + 1);
  });

  it("queda no meio da resposta rejeita o envio com mensagem que preserva o texto", async () => {
    const { chat, socket } = connected();
    const reply = chat.send({ message: "oi" });
    await flush();
    socket.serverSend({ type: "token", content: "parcial" });
    socket.serverClose(1006);
    await expect(reply).rejects.toMatchObject({ code: "connection_lost", message: expect.stringContaining("Seu texto foi mantido") });
  });

  it("reconectar agora não espera o intervalo", async () => {
    const { chat, socket } = connected();
    socket.serverClose(1006);
    await flush();
    chat.reconnectNow();
    expect(FakeWebSocket.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeWebSocket.instances).toHaveLength(2); // o timer antigo foi cancelado
  });

  it("conexão que não autentica em 10 s é fechada e entra em reconexão", async () => {
    const chat = new ChatSocket(URL);
    chat.start();
    FakeWebSocket.latest().serverOpen(); // abre, mas o servidor nunca responde ready
    await vi.advanceTimersByTimeAsync(10_000);
    await flush();
    expect(chat.getState().status).toBe("reconnecting");
  });

  it("muitas conexões (4429) avisa para fechar outras abas", async () => {
    const chat = new ChatSocket(URL);
    chat.start();
    const reply = chat.send({ message: "oi" });
    FakeWebSocket.latest().serverClose(4429);
    await expect(reply).rejects.toMatchObject({ code: "too_many" });
  });
});

describe("fechamentos do servidor", () => {
  it("inatividade (4408) não mostra aviso e reabre no próximo envio", async () => {
    const { chat, socket } = connected();
    socket.serverClose(4408);
    await flush();
    expect(chat.getState().status).toBe("idle");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);

    const reply = chat.send({ message: "voltei" });
    expect(FakeWebSocket.instances).toHaveLength(2);
    FakeWebSocket.latest().serverAccept();
    await flush();
    FakeWebSocket.latest().serverSend({ type: "done", done: true, tokens: 3, message: answer });
    await expect(reply).resolves.toEqual(answer);
  });

  it("token expirado (4401) é renovado antes de reconectar", async () => {
    refreshAccessToken.mockImplementation(async () => {
      useAuthStore.setState({ token: "token-2" });
      return "token-2";
    });
    const { chat, socket } = connected();
    socket.serverClose(4401);
    await flush();
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    const next = FakeWebSocket.latest();
    next.serverOpen();
    expect(next.sent[0]).toEqual({ type: "auth", token: "token-2" });
    next.serverSend({ type: "ready" });
    await flush();
    expect(chat.getState().status).toBe("open");
  });

  it("renovação recusada encerra sem novas tentativas", async () => {
    refreshAccessToken.mockResolvedValue(null);
    const { chat, socket } = connected();
    socket.serverClose(4401);
    await flush();
    expect(chat.getState().status).toBe("closed");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("envio recusado com 4401 antes do ready renova o token e reenvia uma vez", async () => {
    refreshAccessToken.mockImplementation(async () => {
      useAuthStore.setState({ token: "token-2" });
      return "token-2";
    });
    const chat = new ChatSocket(URL);
    const reply = chat.send({ message: "oi" });
    const first = FakeWebSocket.latest();
    first.serverOpen();
    first.serverClose(4401);
    await flush();
    await flush();
    const retry = FakeWebSocket.latest();
    expect(retry).not.toBe(first);
    retry.serverAccept();
    await flush();
    expect(retry.sent).toEqual([{ type: "auth", token: "token-2" }, { type: "message", message: "oi" }]);
    retry.serverSend({ type: "done", done: true, tokens: 3, message: answer });
    await expect(reply).resolves.toEqual(answer);
  });

  it("sem token na sessão nem tenta conectar", async () => {
    useAuthStore.setState({ token: null });
    const chat = new ChatSocket(URL);
    await expect(chat.send({ message: "oi" })).rejects.toMatchObject({ code: "unauthorized" });
    expect(FakeWebSocket.instances).toHaveLength(0);
  });
});

describe("ciclo de vida da tela", () => {
  it("montar, desmontar e montar de novo (StrictMode) deixa uma única conexão viva e sem reconexão fantasma", async () => {
    const chat = new ChatSocket(URL);
    chat.start();
    const first = FakeWebSocket.latest();
    chat.stop();
    chat.start();
    const second = FakeWebSocket.latest();
    expect(second).not.toBe(first);
    await flush(); // o close do primeiro socket chega agora
    second.serverAccept();
    await flush();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(chat.getState().status).toBe("open");
  });

  it("sair da tela fecha a conexão e não reconecta", async () => {
    const { chat, socket } = connected();
    chat.stop();
    await flush();
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
