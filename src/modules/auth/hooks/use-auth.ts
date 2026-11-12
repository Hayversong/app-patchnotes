import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { forgotPassword, getCurrentUser, login, logout, register, resetPassword } from "@/modules/auth/services/auth.service";
import { useAuthStore } from "@/store/authStore";

/** Ao entrar, descarta dados em cache de uma sessão anterior (outra conta no mesmo navegador). */
function useStartSession() {
  const queryClient = useQueryClient();
  const setSession = useAuthStore((state) => state.setSession);
  return useCallback((user: Parameters<typeof setSession>[0], token: string) => {
    queryClient.clear();
    setSession(user, token);
  }, [queryClient, setSession]);
}

export function useLoginMutation() {
  const startSession = useStartSession();
  return useMutation({
    mutationFn: login,
    onSuccess: ({ user, token }) => startSession(user, token),
  });
}

export function useRegisterMutation() {
  const startSession = useStartSession();
  return useMutation({
    mutationFn: register,
    onSuccess: ({ user, token }) => startSession(user, token),
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

/** Sai na hora e revoga a sessão no servidor em segundo plano (falha de rede não impede sair). */
export function useLogout() {
  const clearSession = useAuthStore((state) => state.clearSession);
  return useCallback(() => {
    void logout().catch(() => undefined);
    clearSession();
  }, [clearSession]);
}

export function useForgotPasswordMutation() {
  return useMutation({ mutationFn: forgotPassword });
}

export function useResetPasswordMutation() {
  return useMutation({ mutationFn: resetPassword });
}
