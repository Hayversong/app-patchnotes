/**
 * Endereços do backend vistos pelo navegador.
 *
 * As chamadas REST usam caminhos relativos (/api/...). Em desenvolvimento passam pelo rewrite do Next
 * (next.config.mjs), que as encaminha para API_URL; no Docker, pelo proxy reverso (docker/nginx.conf).
 *
 * O rewrite do Next não encaminha WebSocket. Por isso NEXT_PUBLIC_CHAT_WS_URL aceita dois formatos:
 * - URL completa (ws://localhost:8000/ws/chat): o navegador conecta direto no backend (desenvolvimento).
 * - Caminho (/ws/chat): mesmo endereço do site, com ws:// ou wss:// conforme a página (atrás de um proxy).
 */
const DEFAULT_CHAT_WS_URL = "ws://localhost:8000/ws/chat";

export const chatSocketSetting = process.env.NEXT_PUBLIC_CHAT_WS_URL || DEFAULT_CHAT_WS_URL;

/** URL final do WebSocket. Caminhos relativos são resolvidos contra a página atual. */
export function resolveChatSocketUrl(setting = chatSocketSetting, location: Pick<Location, "protocol" | "host"> = window.location): string {
  if (!setting.startsWith("/")) return setting;
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}${setting}`;
}
