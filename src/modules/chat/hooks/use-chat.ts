import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getChatHistory, sendChatMessage } from "@/modules/chat/services/chat.service";

export function useChatHistory() {
  return useQuery({ queryKey: ["chat", "history"], queryFn: getChatHistory });
}

export function useSendChatMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: sendChatMessage,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "metrics"] });
      void queryClient.invalidateQueries({ queryKey: ["chat", "history"] });
    },
  });
}
