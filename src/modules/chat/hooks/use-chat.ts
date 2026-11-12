import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { chatSocketUrl } from "@/lib/api-mode";
import { ChatSocket } from "@/modules/chat/services/chat-socket";
import { getChatHistory, sendChatMessage } from "@/modules/chat/services/chat.service";
import type { SendChatVariables } from "@/modules/chat/types/chat.types";

export function useChatHistory() {
  return useQuery({ queryKey: ["chat", "history"], queryFn: getChatHistory });
}

/** Indica se o chat recebe a resposta token a token (WebSocket) ou de uma vez (REST). */
export const isChatStreaming = Boolean(chatSocketUrl);

export function useSendChatMessage() {
  const queryClient = useQueryClient();
  const socketRef = useRef<ChatSocket | null>(null);

  // A conexão vive enquanto a tela do chat estiver aberta; sair dela interrompe a geração.
  useEffect(() => () => {
    socketRef.current?.close();
    socketRef.current = null;
  }, []);

  return useMutation({
    mutationFn: ({ message, context, onToken }: SendChatVariables) => {
      const request = context === undefined ? { message } : { message, context };
      if (!chatSocketUrl) return sendChatMessage(request);
      socketRef.current ??= new ChatSocket(chatSocketUrl);
      return socketRef.current.send(request, onToken);
    },
    // Aguarda o histórico atualizado antes de concluir, para a resposta não "piscar" entre o streaming e a lista.
    onSuccess: (answer, { onComplete }) => {
      onComplete?.(answer);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ["chat", "history"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
  });
}
