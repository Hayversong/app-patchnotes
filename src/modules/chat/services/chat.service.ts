import { api } from "@/lib/axios";
import type { SendChatRequest, SendChatResponse } from "@/modules/chat/types/chat.types";

export async function sendChatMessage(payload: SendChatRequest): Promise<SendChatResponse> {
  const { data } = await api.post<SendChatResponse>("/chat/send", payload);
  return data;
}
