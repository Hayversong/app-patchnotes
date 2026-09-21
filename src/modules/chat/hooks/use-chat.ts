import { useMutation, useQueryClient } from "@tanstack/react-query";

import { sendChatMessage } from "@/modules/chat/services/chat.service";

export function useSendChatMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: sendChatMessage,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["dashboard", "metrics"] }),
  });
}
