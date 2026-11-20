import { describe, expect, it } from "vitest";

import { resolveChatSocketUrl } from "@/lib/config";

describe("endereço do WebSocket do chat", () => {
  it("URL completa é usada como está", () => {
    expect(resolveChatSocketUrl("ws://localhost:8000/ws/chat", { protocol: "https:", host: "app.dev" })).toBe("ws://localhost:8000/ws/chat");
  });

  it("caminho relativo usa o mesmo endereço da página, com wss em HTTPS", () => {
    expect(resolveChatSocketUrl("/ws/chat", { protocol: "http:", host: "localhost:3000" })).toBe("ws://localhost:3000/ws/chat");
    expect(resolveChatSocketUrl("/ws/chat", { protocol: "https:", host: "patchnotes.dev" })).toBe("wss://patchnotes.dev/ws/chat");
  });
});
