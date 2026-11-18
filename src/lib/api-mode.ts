/** Em desenvolvimento a API é simulada pelo MSW, a menos que NEXT_PUBLIC_API_MOCKING=disabled. */
export const isMockApiEnabled = process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_API_MOCKING !== "disabled";

/**
 * URL do WebSocket do chat (ex.: ws://127.0.0.1:8000/ws/chat). Só é usada com o backend real:
 * com o MSW, ou sem a variável, o chat usa POST /api/chat/send.
 */
export const chatSocketUrl = isMockApiEnabled ? undefined : process.env.NEXT_PUBLIC_CHAT_WS_URL || undefined;
