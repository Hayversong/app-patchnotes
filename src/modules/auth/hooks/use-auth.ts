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

/**
 * Encerra a sessão: a API revoga o refresh token e apaga os cookies HttpOnly (o JavaScript não consegue), e só
 * então a página é recarregada no /login. O recarregamento descarta da memória todos os dados da conta.
 * Se a rede falhar, sai do mesmo jeito: sem o indicador de sessão, o app não usa mais os cookies que sobraram.
 */
export function useLogout() {
  const clearSession = useAuthStore((state) => state.clearSession);
  return useCallback(async () => {
    clearSession();
    await logout().catch(() => undefined);
    window.location.replace("/login");
  }, [clearSession]);
}

export function useForgotPasswordMutation() {
  return useMutation({ mutationFn: forgotPassword });
}

export function useResetPasswordMutation() {
  return useMutation({ mutationFn: resetPassword });
}
