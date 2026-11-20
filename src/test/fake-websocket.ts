/** WebSocket controlado pelo teste: registra o que o cliente envia e simula eventos do servidor. */
export class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  sent: Array<Record<string, unknown>> = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  static latest(): FakeWebSocket {
    const socket = FakeWebSocket.instances.at(-1);
    if (!socket) throw new Error("nenhum WebSocket foi aberto");
    return socket;
  }

  static reset() {
    FakeWebSocket.instances = [];
  }

  send(data: string) {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  close(code = 1000) {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    queueMicrotask(() => this.onclose?.({ code }));
  }

  // --- lado do servidor ---
  serverOpen() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  serverSend(event: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }

  /** Abre, recebe o auth e responde "ready". */
  serverAccept() {
    this.serverOpen();
    this.serverSend({ type: "ready" });
  }

  serverClose(code: number) {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code });
  }
}
