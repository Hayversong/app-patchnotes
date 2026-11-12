import axios from "axios";

import type { AuthResponse } from "@/modules/auth/types/auth.types";
import type { ApiErrorResponse } from "@/shared/types/api.types";
import { useAuthStore } from "@/store/authStore";

declare module "axios" {
  interface AxiosRequestConfig {
    /** Rotas de autenticação: um 401 aqui não dispara refresh (ex.: senha errada no login). */
    skipAuthRefresh?: boolean;
    /** Marca a requisição já refeita após um refresh, para não entrar em laço. */
    retriedAfterRefresh?: boolean;
  }
}

export const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

/**
 * Renova o access token com o refresh token (cookie httpOnly enviado pelo navegador).
 * Chamadas simultâneas compartilham a mesma renovação. Se falhar, encerra a sessão e retorna null.
 */
export function refreshAccessToken(): Promise<string | null> {
  refreshing ??= api
    .post<AuthResponse>("/auth/refresh", undefined, { skipAuthRefresh: true })
    .then(({ data }) => {
      useAuthStore.getState().setSession(data.user, data.token);
      return data.token;
    })
    .catch(() => {
      const { token, clearSession } = useAuthStore.getState();
      if (token) clearSession({ expired: true });
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || error.response?.status !== 401 || !error.config) throw error;
    const config = error.config;
    const { token, clearSession } = useAuthStore.getState();
    // Sem sessão, ou rota de autenticação: o 401 é a resposta final (ex.: credenciais inválidas).
    if (!token || config.skipAuthRefresh) throw error;
    if (config.retriedAfterRefresh) {
      clearSession({ expired: true });
      throw error;
    }
    // Outra requisição já renovou o token enquanto esta estava em voo: basta refazer com o atual.
    const usedToken = String(config.headers.Authorization ?? "").replace(/^Bearer /, "");
    const freshToken = usedToken && usedToken !== token ? token : await refreshAccessToken();
    if (!freshToken) throw error;
    config.retriedAfterRefresh = true;
    config.headers.Authorization = `Bearer ${freshToken}`;
    return api(config);
  },
);

export function getApiErrorMessage(error: unknown, fallback = "Não foi possível concluir a solicitação. Tente novamente."): string {
  if (axios.isAxiosError<Partial<ApiErrorResponse>>(error)) {
    return error.response?.data?.message ?? fallback;
  }
  return fallback;
}
