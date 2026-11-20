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
    /** Geração da sessão quando a requisição saiu (ver `sessionGeneration`). */
    sessionGeneration?: number;
  }
}

/**
 * A autenticação vai nos cookies HttpOnly que a API grava (o navegador os anexa sozinho em /api, mesmo origin).
 * Nenhum token passa pelo JavaScript.
 */
export const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

/** Sobe a cada renovação bem-sucedida: um 401 de requisição mais antiga só precisa ser refeito, sem novo refresh. */
let sessionGeneration = 0;
let refreshing: Promise<boolean> | null = null;

api.interceptors.request.use((config) => {
  config.sessionGeneration = sessionGeneration;
  return config;
});

/**
 * Renova a sessão com o refresh token (cookie httpOnly). A API regrava os dois cookies.
 * Chamadas simultâneas compartilham a mesma renovação. Se falhar, encerra a sessão e devolve false.
 */
export function refreshAccessToken(): Promise<boolean> {
  refreshing ??= api
    .post<AuthResponse>("/auth/refresh", undefined, { skipAuthRefresh: true })
    .then(({ data }) => {
      sessionGeneration += 1;
      useAuthStore.getState().setSession(data.user);
      return true;
    })
    .catch(() => {
      const { authenticated, clearSession } = useAuthStore.getState();
      if (authenticated) clearSession({ expired: true });
      // Só a API apaga os cookies HttpOnly vencidos que sobraram no navegador.
      void api.post("/auth/logout", undefined, { skipAuthRefresh: true }).catch(() => undefined);
      return false;
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
    const { authenticated, clearSession } = useAuthStore.getState();
    // Sem sessão, ou rota de autenticação: o 401 é a resposta final (ex.: credenciais inválidas).
    if (!authenticated || config.skipAuthRefresh) throw error;
    if (config.retriedAfterRefresh) {
      clearSession({ expired: true });
      throw error;
    }
    // Outra requisição já renovou a sessão enquanto esta estava em voo: basta refazer.
    const renewed = (config.sessionGeneration ?? 0) < sessionGeneration || (await refreshAccessToken());
    if (!renewed) throw error;
    config.retriedAfterRefresh = true;
    return api(config);
  },
);

export function getApiErrorMessage(error: unknown, fallback = "Não foi possível concluir a solicitação. Tente novamente."): string {
  if (axios.isAxiosError<Partial<ApiErrorResponse>>(error)) {
    return error.response?.data?.message ?? fallback;
  }
  return fallback;
}
