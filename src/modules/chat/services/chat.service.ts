import { api } from "@/lib/axios";
import type { GetChatHistoryResponse } from "@/modules/chat/types/chat.types";

/** Histórico persistido no banco. O envio de mensagens é só por WebSocket (chat-socket.ts). */
export async function getChatHistory(): Promise<GetChatHistoryResponse> {
  const { data } = await api.get<GetChatHistoryResponse>("/chat/history");
  return data;
}
