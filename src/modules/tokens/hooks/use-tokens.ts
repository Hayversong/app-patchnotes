import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getTokenBalance, getTokenHistory, rechargeTokens } from "@/modules/tokens/services/tokens.service";

export function useTokenBalance() {
  return useQuery({ queryKey: ["tokens", "balance"], queryFn: getTokenBalance });
}

export function useTokenHistory() {
  return useQuery({ queryKey: ["tokens", "history"], queryFn: () => getTokenHistory() });
}

export function useRechargeTokens() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: rechargeTokens,
    onSuccess: (balance) => {
      queryClient.setQueryData(["tokens", "balance"], balance);
      return queryClient.invalidateQueries({ queryKey: ["tokens", "history"] });
    },
  });
}
