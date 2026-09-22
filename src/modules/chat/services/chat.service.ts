import { api } from "@/lib/axios";
import type { GetChatHistoryResponse, SendChatRequest, SendChatResponse } from "@/modules/chat/types/chat.types";

export async function getChatHistory(): Promise<GetChatHistoryResponse> {
  const { data } = await api.get<GetChatHistoryResponse>("/chat/history");
  return data;
}

export async function sendChatMessage(payload: SendChatRequest): Promise<SendChatResponse> {
  const { data } = await api.post<SendChatResponse>("/chat/send", payload);
  return data;
}
