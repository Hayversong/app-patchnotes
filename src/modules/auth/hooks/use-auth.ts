import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { forgotPassword, getCurrentUser, login, logout, register, resetPassword, verifyEmail } from "@/modules/auth/services/auth.service";
import { useAuthStore } from "@/store/authStore";

/** Ao entrar, descarta dados em cache de uma sessão anterior (outra conta no mesmo navegador). */
function useStartSession() {
  const queryClient = useQueryClient();
  const setSession = useAuthStore((state) => state.setSession);
  return useCallback((user: Parameters<typeof setSession>[0]) => {
    queryClient.clear();
    setSession(user);
  }, [queryClient, setSession]);
}

export function useLoginMutation() {
  const startSession = useStartSession();
  return useMutation({
    mutationFn: login,
    onSuccess: ({ user }) => startSession(user),
  });
}

/** Só pede o cadastro: a sessão abre quando a pessoa confirma o e-mail (useVerifyEmailMutation). */
export function useRegisterMutation() {
  return useMutation({ mutationFn: register });
}

export function useVerifyEmailMutation() {
  const startSession = useStartSession();
  return useMutation({
    mutationFn: verifyEmail,
    onSuccess: ({ user }) => startSession(user),
  });
}

export function useCurrentUserQuery() {
  const authenticated = useAuthStore((state) => state.authenticated);
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: getCurrentUser,
    enabled: authenticated,
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
