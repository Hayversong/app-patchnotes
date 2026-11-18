/**
 * Endereços do backend vistos pelo navegador.
 *
 * As chamadas REST usam caminhos relativos (/api/...) e passam pelo rewrite do Next (next.config.mjs), que as
 * encaminha para API_URL. O rewrite não cobre WebSocket, então o chat conecta direto no backend.
 */
const DEFAULT_CHAT_WS_URL = "ws://localhost:8000/ws/chat";

export const chatSocketUrl = process.env.NEXT_PUBLIC_CHAT_WS_URL || DEFAULT_CHAT_WS_URL;
