import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createDevlogEntry, getDevlogEntries } from "@/modules/devlog/services/devlog.service";

export function useDevlogEntries() {
  return useQuery({ queryKey: ["devlog", "entries"], queryFn: getDevlogEntries });
}

export function useCreateDevlogEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createDevlogEntry,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["devlog", "entries"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "metrics"] });
    },
  });
}
