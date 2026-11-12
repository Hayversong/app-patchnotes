import axios from "axios";

import type { ApiErrorResponse } from "@/shared/types/api.types";
import { useAuthStore } from "@/store/authStore";

export const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      // Só há "sessão expirada" quando existia um token; um 401 do login é credencial inválida.
      const { token, clearSession } = useAuthStore.getState();
      if (token) clearSession({ expired: true });
    }
    return Promise.reject(error);
  },
);

export function getApiErrorMessage(error: unknown, fallback = "Não foi possível concluir a solicitação. Tente novamente."): string {
  if (axios.isAxiosError<Partial<ApiErrorResponse>>(error)) {
    return error.response?.data?.message ?? fallback;
  }
  return fallback;
}
