import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { resolveChatSocketUrl } from "@/lib/config";
import { ChatSocket } from "@/modules/chat/services/chat-socket";
import { getChatHistory } from "@/modules/chat/services/chat.service";
import type { SendChatVariables } from "@/modules/chat/types/chat.types";

/** Histórico vem do banco via REST ao abrir a tela; o WebSocket só transmite respostas novas. */
export function useChatHistory() {
  return useQuery({ queryKey: ["chat", "history"], queryFn: getChatHistory });
}

/**
 * Conexão WebSocket do chat, aberta enquanto a tela estiver montada. Sair da tela encerra a conexão
 * (e interrompe uma geração em andamento).
 */
export function useChatSocket() {
  const [socket] = useState(() => new ChatSocket(resolveChatSocketUrl()));
  useEffect(() => {
    socket.start();
    return () => socket.stop();
  }, [socket]);
  const subscribe = useCallback((listener: () => void) => socket.subscribe(listener), [socket]);
  const state = useSyncExternalStore(subscribe, () => socket.getState(), () => socket.getState());
  return { socket, ...state, reconnectNow: () => socket.reconnectNow() };
}

export function useSendChatMessage(socket: ChatSocket) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ message, context, onToken }: SendChatVariables) =>
      socket.send(context === undefined ? { message } : { message, context }, onToken),
    // Aguarda o histórico atualizado antes de concluir, para a resposta não "piscar" entre o streaming e a lista.
    onSuccess: (answer, { onComplete }) => {
      onComplete?.(answer);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ["chat", "history"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["tokens"] }),
      ]);
    },
  });
}
