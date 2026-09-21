import { useMutation, useQuery } from "@tanstack/react-query";

import { getCurrentUser, login, register } from "@/modules/auth/services/auth.service";
import { useAuthStore } from "@/store/authStore";

export function useLoginMutation() {
  const setSession = useAuthStore((state) => state.setSession);
  return useMutation({
    mutationFn: login,
    onSuccess: ({ user, token }) => setSession(user, token),
  });
}

export function useRegisterMutation() {
  const setSession = useAuthStore((state) => state.setSession);
  return useMutation({
    mutationFn: register,
    onSuccess: ({ user, token }) => setSession(user, token),
  });
}

export function useCurrentUserQuery() {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: getCurrentUser,
    enabled: Boolean(token),
    select: (data) => data.user,
    staleTime: 60_000,
  });
}
